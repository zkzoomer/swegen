#!/usr/bin/env python3
"""Create deterministic task deltas and verify them on a persistent compute worker."""
import argparse
import errno
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import tarfile
import tempfile

ROOT_SKIP = {'jobs', 'qc_artifacts', 'outputs', '.agents', '.codex', '.micro1-helix', '.helix', '.aws'}
ANY_SKIP = {'node_modules', '.venv', '__pycache__', '.pnpm-store'}


def digest(file):
    sha = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            sha.update(chunk)
    return sha.hexdigest()


def valid(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or '\\' in name or str(p) != name:
        raise ValueError('unsafe snapshot path: ' + name)
    return name


def identity(files):
    return hashlib.sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def scan(source):
    source = source.resolve(strict=True)
    files = {}
    excluded = []
    for parent, directories, names in os.walk(source, followlinks=False):
        relative = Path(parent).relative_to(source)
        directories.sort()
        for name in list(directories):
            item = Path(parent) / name
            if name in ANY_SKIP or (parent == str(source) and name in ROOT_SKIP):
                directories.remove(name)
                excluded.append(str(item.relative_to(source)))
            elif item.is_symlink():
                raise ValueError('snapshot symlink must be resolved explicitly: ' + str(item))
        for name in sorted(names):
            item = Path(parent) / name
            if relative == Path('.') and (name == '.env' or name.startswith('.env.') and name not in {'.env.example', '.env.template'}):
                excluded.append(name)
                continue
            if not stat.S_ISREG(item.lstat().st_mode):
                raise ValueError('snapshot entry is not a regular file: ' + str(item))
            key = valid(item.relative_to(source).as_posix())
            files[key] = {'sha256': digest(item), 'mode': stat.S_IMODE(item.stat().st_mode)}
    return files, excluded


def pack(source, bundle, manifest_file, base=None):
    source = source.resolve(strict=True)
    files, excluded = scan(source)
    previous = json.loads(base.read_text()) if base else {'files': {}}
    changed = [name for name in files if previous['files'].get(name) != files[name]]
    removed = sorted(set(previous['files']) - set(files), reverse=True)
    manifest = {'id': identity(files), 'base': previous.get('id'), 'files': files,
                'changed': changed, 'removed': removed, 'excluded': excluded}
    with bundle.open('wb') as output, gzip.GzipFile(filename='', fileobj=output, mode='wb', mtime=0) as compressed, tarfile.open(fileobj=compressed, mode='w') as archive:
        for name in sorted(changed):
            item = source / name
            info = archive.gettarinfo(str(item), arcname=name)
            info.uid = info.gid = info.mtime = 0
            info.uname = info.gname = ''
            with item.open('rb') as stream:
                archive.addfile(info, stream)
            if digest(item) != files[name]['sha256']:
                raise ValueError('source changed during snapshot: ' + name)
    manifest_file.write_text(json.dumps(manifest, sort_keys=True))
    return manifest


def verify(directory, manifest):
    if manifest['id'] != identity(manifest['files']):
        raise ValueError('invalid snapshot identity')
    actual = set()
    for parent, directories, names in os.walk(directory, followlinks=False):
        for name in directories:
            if (Path(parent)/name).is_symlink():
                raise ValueError('snapshot contains a symlink directory')
        actual.update((Path(parent)/name).relative_to(directory).as_posix() for name in names)
    if actual != set(manifest['files']):
        raise ValueError('snapshot contains missing or unexpected files')
    for name, info in manifest['files'].items():
        file = directory / valid(name)
        if file.is_symlink() or not file.is_file() or digest(file) != info['sha256'] or stat.S_IMODE(file.stat().st_mode) != info['mode']:
            raise ValueError('snapshot verification failed: ' + name)
    return directory


def prune_empty_directories(root):
    # Snapshot identity describes regular files. Delta deletions must not leave
    # stale build/editor directories behind in otherwise identical snapshots.
    for parent, directories, _ in os.walk(root, topdown=False, followlinks=False):
        for name in directories:
            directory = Path(parent) / name
            if directory.is_symlink():
                continue  # verify rejects links without following them
            try:
                directory.rmdir()
            except OSError as error:
                if error.errno not in {errno.ENOTEMPTY, errno.EEXIST}:
                    raise


def apply(root, bundle, manifest_file):
    manifest = json.loads(manifest_file.read_text())
    identifier = manifest['id']
    if len(identifier) != 64 or any(c not in '0123456789abcdef' for c in identifier):
        raise ValueError('invalid snapshot ID')
    root.mkdir(parents=True, exist_ok=True)
    destination = root / identifier
    if destination.exists():
        prune_empty_directories(destination)
        return verify(destination, manifest)
    temporary = Path(tempfile.mkdtemp(prefix='.incoming-', dir=root))
    try:
        if manifest.get('base'):
            base_id = manifest['base']
            if len(base_id) != 64 or any(c not in '0123456789abcdef' for c in base_id):
                raise ValueError('invalid base ID')
            base = root / base_id
            if not base.is_dir():
                raise ValueError('base snapshot missing; send a full snapshot')
            shutil.copytree(base, temporary, dirs_exist_ok=True)
        for name in manifest['removed']:
            file = temporary / valid(name)
            file.unlink(missing_ok=True)
        with tarfile.open(bundle, 'r:gz') as archive:
            names = set()
            for member in archive:
                name = valid(member.name)
                if not member.isfile() or name in names or name not in manifest['changed']:
                    raise ValueError('unexpected snapshot archive entry: ' + name)
                names.add(name)
                file = temporary / name
                if file.is_dir():
                    shutil.rmtree(file)
                file.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, file.open('wb') as output:
                    shutil.copyfileobj(source, output)
                file.chmod(manifest['files'][name]['mode'])
            if names != set(manifest['changed']):
                raise ValueError('snapshot delta is incomplete')
        prune_empty_directories(temporary)
        verify(temporary, manifest)
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['pack', 'apply', 'scan'])
    parser.add_argument('directory', type=Path)
    parser.add_argument('bundle', type=Path, nargs='?')
    parser.add_argument('manifest', type=Path, nargs='?')
    parser.add_argument('--base', type=Path)
    args = parser.parse_args()
    if args.action == 'scan':
        files, excluded = scan(args.directory)
        print(json.dumps({'id': identity(files), 'excluded': excluded}))
    elif args.action == 'pack':
        result = pack(args.directory, args.bundle, args.manifest, args.base)
        print(json.dumps({key: result[key] for key in ['id', 'base', 'changed', 'removed', 'excluded']}))
    else:
        print(json.dumps({'path': str(apply(args.directory, args.bundle, args.manifest))}))


if __name__ == '__main__':
    main()
