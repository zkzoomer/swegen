#!/usr/bin/env python3
"""Collect private review evidence separately from the official task ZIP.

Only log/report paths are included; never package credential stores or capture tooling.
This is a snapshot on failure/interruption, not a claim that a live process has flushed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
from zipfile import ZIP_DEFLATED, ZipFile


def secret_values(homes):
    values = [value for key, value in os.environ.items()
              if re.search(r'(API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|PASSWORD|SECRET)$', key)]

    def visit(value, key=''):
        if isinstance(value, str) and re.search(r'(token|api_key|secret|password)$', key, re.I):
            values.append(value)
        elif isinstance(value, dict):
            for key, child in value.items():
                visit(child, key)
    for home in homes:
        for name in ['.codex/auth.json', '.rv/auth.json']:
            try:
                visit(json.loads((home / name).read_text()))
            except (OSError, ValueError):
                pass
    return [value for value in values if len(value) >= 8]


def make_redactor(values):
    import base64
    secrets = sorted({encoded for value in values for encoded in
                      [value, base64.b64encode(value.encode()).decode()]}, key=len, reverse=True)

    def redact(text):
        for value in secrets:
            text = text.replace(value, '[REDACTED]')
        text = re.sub(r'\bsk-(?:or-v1-)?[A-Za-z0-9_-]{20,}\b', '[REDACTED]', text)
        text = re.sub(r'(Bearer\s+)[A-Za-z0-9._~-]{16,}', r'\1[REDACTED]', text, flags=re.I)
        return re.sub(r'("(?:access_token|refresh_token|id_token|api_key|openrouter_api_key|daytona_api_key|password|secret)"\s*:\s*")[^"\r\n]+"',
                      r'\1[REDACTED]"', text, flags=re.I)
    return redact


def regular_files(root):
    if not root.is_dir() or root.is_symlink():
        return
    def walk_error(error):
        raise error
    for parent, directories, names in os.walk(root, followlinks=False, onerror=walk_error):
        directories[:] = sorted(name for name in directories
                                if name not in {'.git', 'node_modules', '.venv', '__pycache__'}
                                and not (Path(parent) / name).is_symlink())
        for name in sorted(names):
            file = Path(parent) / name
            if stat.S_ISREG(file.lstat().st_mode):
                yield file


def collect(destination, homes, staging):
    # Both authors run locally; their official traces already live with Helix.
    # Retain execution diagnostics/reports, without a second SDK transcript archive.
    report_names = {'stdout', 'stderr', 'stdout.log', 'stderr.log', 'test-output.txt',
                    'reward.txt', 'reward.json', 'validation-summary.md', 'failure-summary.md',
                    'disputes.md', 'result.json', 'command.sh'}
    transcript_names = {'trajectory.json', 'agent.txt', 'agent.log', 'events.jsonl', 'outer.txt'}

    def report(p):
        return (p.name not in transcript_names and
                (p.name in report_names or
                 ('qc_artifacts' in p.parts and p.suffix in {'.md', '.json', '.txt'})))
    sources = [('author-staging', staging),
               ('capture-staging', staging.parent / 'capture-staging')]
    redact = make_redactor(secret_values(homes))
    manifest = {'format': 2, 'files': [], 'sources': [], 'errors': [],
                'note': 'Private review evidence. Known credentials redacted; do not publish. Failure/interruption collections are snapshots.'}
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'wb') as output, ZipFile(output, 'w', ZIP_DEFLATED, allowZip64=True) as archive:
        for label, root in sources:
            manifest['sources'].append({'label': label, 'path': str(root), 'present': root.is_dir()})
            for source in regular_files(root):
                if not report(source):
                    continue
                name = f'{label}/{source.relative_to(root).as_posix()}'
                try:
                    # Stream diagnostics without buffering an entire build log.
                    with source.open('r', encoding='utf8', errors='replace') as reader, archive.open(name, 'w', force_zip64=True) as writer:
                        for line in reader:
                            clean = redact(line)
                            writer.write(clean.encode())
                    manifest['files'].append(name)
                except OSError as error:
                    manifest['errors'].append({'path': str(source), 'error': str(error)})
        archive.writestr('manifest.json', json.dumps(manifest, indent=2) + '\n')
    digest = hashlib.sha256()
    with destination.open('rb') as archive:
        for chunk in iter(lambda: archive.read(1024 * 1024), b''):
            digest.update(chunk)
    return {'path': str(destination), 'size': destination.stat().st_size,
            'sha256': digest.hexdigest(), 'files': len(manifest['files']), 'errors': manifest['errors']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    homes = list(dict.fromkeys([Path.home(), Path('/root'), Path('/home/daytona')]))
    print(json.dumps(collect(args.destination, homes, Path('/home/daytona/author-staging'))))


if __name__ == '__main__':
    main()
