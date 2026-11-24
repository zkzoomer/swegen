#!/usr/bin/env python3
"""Prepare a public, pinned browser-only image locally and install it on a worker."""
import argparse
import fcntl
import gzip
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import tarfile

VERSION = '1.48.0'
SOURCE = 'mcr.microsoft.com/playwright/python@sha256:b4bedaaee2a9d1ca83dc30ec8cae65105151dbe7ba41be0154cee6a6a7cdc669'
IMAGE = 'swegen-capture-browsers:pw1.48.0-b4bedaaee2a9'


def digest(file):
    with Path(file).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def docker(*args, output=False):
    print('Browser bundle: docker ' + ' '.join(args), file=sys.stderr, flush=True)
    return subprocess.check_output(['docker', *args], text=True).strip() if output else subprocess.run(['docker', *args], stdout=sys.stderr, check=True)


def validate(receipt):
    archive = Path(receipt['file'])
    if receipt.get('version') != VERSION or receipt.get('source') != SOURCE or receipt.get('image') != IMAGE:
        raise ValueError('Capture browser bundle version/source does not match the pinned kit')
    if not archive.is_file() or archive.is_symlink() or archive.stat().st_size != receipt['bytes'] or digest(archive) != receipt['sha256']:
        raise ValueError('Capture browser archive is missing or corrupt')
    if not isinstance(receipt.get('image_id'), str) or not receipt['image_id'].startswith('sha256:'):
        raise ValueError('Missing browser image identity')
    return archive


def prepare(cache):
    cache = Path(cache).expanduser().resolve()
    cache.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (cache / 'prepare.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        receipt_file = cache / 'receipt.json'
        if receipt_file.exists():
            try:
                receipt = json.loads(receipt_file.read_text())
                validate(receipt)
                return receipt
            except (OSError, ValueError, KeyError):
                print('Rebuilding incomplete browser cache.', file=sys.stderr)
        # The temporary context contains only this Dockerfile, never task source,
        # the private kit, credentials, or the controller repository.
        with tempfile.TemporaryDirectory(prefix='build-', dir=cache) as temp:
            directory = Path(temp)
            (directory / 'Dockerfile').write_text(f'FROM {SOURCE} AS upstream\nFROM scratch\nCOPY --from=upstream /ms-playwright/ /ms-playwright/\n')
            docker('build', '--platform', 'linux/amd64', '-t', IMAGE, str(directory))
        image_id = docker('image', 'inspect', IMAGE, '--format', '{{.Id}}', output=True)
        archive = cache / 'browsers.tar.gz'
        partial = cache / 'browsers.partial.tar.gz'
        process = subprocess.Popen(['docker', 'save', IMAGE], stdout=subprocess.PIPE)
        try:
            with partial.open('wb') as raw, gzip.GzipFile(fileobj=raw, mode='wb', compresslevel=1, mtime=0) as packed:
                shutil.copyfileobj(process.stdout, packed, 1024 * 1024)
            if process.wait() != 0:
                raise RuntimeError('Could not export capture browser image')
            partial.replace(archive)
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait()
            process.stdout.close()
            partial.unlink(missing_ok=True)
        receipt = {'version': VERSION, 'source': SOURCE, 'image': IMAGE, 'image_id': image_id,
                   'file': str(archive), 'bytes': archive.stat().st_size, 'sha256': digest(archive)}
        receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')
        return receipt


def archive_identity(archive, receipt):
    """Docker/containerd may expose config ID or OCI manifest ID for one image."""
    with tarfile.open(archive, 'r:gz') as tar:
        manifest = json.load(tar.extractfile('manifest.json'))
        entries = [entry for entry in manifest if IMAGE in entry.get('RepoTags', [])]
        if len(entries) != 1:
            raise ValueError('Browser archive does not identify exactly one expected image')
        config_bytes = tar.extractfile(entries[0]['Config']).read()
        config_id = 'sha256:' + hashlib.sha256(config_bytes).hexdigest()
        if config_id != receipt['image_id']:
            raise ValueError('Browser archive config does not match the pinned receipt')
        config = json.loads(config_bytes)
        if config.get('architecture') != 'amd64' or config.get('os') != 'linux':
            raise ValueError('Browser archive has an unsupported platform')
        ids = {config_id}
        if 'index.json' in tar.getnames():
            index = json.load(tar.extractfile('index.json'))
            for entry in index.get('manifests', []):
                digest_id = entry.get('digest', '')
                if not digest_id.startswith('sha256:'):
                    continue
                blob = tar.extractfile('blobs/sha256/' + digest_id[7:]).read()
                if 'sha256:' + hashlib.sha256(blob).hexdigest() != digest_id:
                    raise ValueError('OCI browser manifest digest mismatch')
                if json.loads(blob).get('config', {}).get('digest') == config_id:
                    ids.add(digest_id)
        layers = config.get('rootfs', {}).get('diff_ids')
        if not layers:
            raise ValueError('Browser archive has no verified filesystem layers')
        return ids, layers


def install(receipt_file):
    receipt_file = Path(receipt_file)
    receipt = json.loads(receipt_file.read_text())
    archive = validate(receipt)
    identities, layers = archive_identity(archive, receipt)
    docker('load', '--input', str(archive))
    loaded = json.loads(docker('image', 'inspect', IMAGE, '--format', '{{json .}}', output=True))
    if (loaded.get('Id') not in identities or loaded.get('Architecture') != 'amd64'
            or loaded.get('Os') != 'linux' or loaded.get('RootFS', {}).get('Layers') != layers):
        raise ValueError('Loaded browser image identity does not match the local bundle')
    ready = receipt_file.parent / 'capture-browser-ready.json'
    ready.write_text(json.dumps({**receipt, 'installed': True}, indent=2) + '\n')
    return {'installed': True, 'image': IMAGE, 'version': VERSION, 'sha256': receipt['sha256']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    prepare_parser = sub.add_parser('prepare')
    prepare_parser.add_argument('--cache', default=str(Path.home() / '.cache/swegen/capture-browsers-pw1.48.0'))
    sub.add_parser('install').add_argument('receipt')
    args = parser.parse_args()
    result = prepare(args.cache) if args.command == 'prepare' else install(args.receipt)
    print(json.dumps(result))


if __name__ == '__main__':
    main()
