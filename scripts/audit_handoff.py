#!/usr/bin/env python3
"""Audit a SWE Multimodal Helix ZIP or its controller handoff, without running tests."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import stat
import subprocess
import tempfile
import tomllib
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile

REQUIRED_TASK_PATHS = (
    'task.toml', 'instruction.md', 'reasoning.md', 'environment/Dockerfile',
    'solution/solve.sh', 'solution/gold_patch.diff', 'tests/test.sh',
    'tests/config.json', 'tests/test_patch.diff', 'tests/log_parsers.py',
)
REASONING_HEADINGS = (
    'what this task requires', 'why it is non-trivial', 'why the media is necessary',
    'the change', 'tests',
)
RESIDUE = {'__pycache__', 'node_modules', '.venv'}
MIB = 1024 * 1024

class AuditError(RuntimeError):
    pass


def safe_members(bundle: ZipFile, label: str) -> list[str]:
    names = []
    seen = set()
    for info in bundle.infolist():
        name = info.filename
        path = PurePosixPath(name)
        if (not name or name.startswith('/') or '\\' in name or '..' in path.parts
                or re.match(r'^[A-Za-z]:', name)):
            raise AuditError(f'{label} contains an unsafe path: {name!r}')
        if name in seen:
            raise AuditError(f'{label} contains a duplicate entry: {name!r}')
        if stat.S_ISLNK(info.external_attr >> 16):
            # Safe links are not needed by the supported task exporter; do not follow
            # arbitrary links while extracting an untrusted solver-produced archive.
            raise AuditError(f'{label} contains a symlink: {name!r}')
        seen.add(name)
        names.append(name)
    return names


def run_git(repo: Path, *args: str) -> str:
    result = subprocess.run(
        ['git', f'--git-dir={repo / ".git"}', f'--work-tree={repo}', *args],
        text=True, capture_output=True, timeout=60,
    )
    if result.returncode:
        raise AuditError(f'vendored Git check failed ({" ".join(args)}): {result.stderr.strip()}')
    return result.stdout.strip()


def validate_config(root: Path, warnings: list[str]) -> tuple[int, int]:
    config = json.loads((root / 'tests/config.json').read_text())
    if not isinstance(config, dict):
        raise AuditError('tests/config.json must be an object')
    def ids(key: str) -> list[str]:
        value = config.get(key)
        if not isinstance(value, list) or not all(isinstance(v, str) and v.strip() for v in value):
            raise AuditError(f'tests/config.json::{key} must contain nonempty strings')
        if len(set(value)) != len(value):
            raise AuditError(f'tests/config.json::{key} contains duplicate IDs')
        return value
    f2p, p2p = ids('fail_to_pass'), ids('pass_to_pass')
    if not f2p:
        raise AuditError('fail_to_pass is empty')
    if len(p2p) < 15:
        raise AuditError('pass_to_pass has fewer than the 15-case minimum')
    if set(f2p) & set(p2p):
        raise AuditError('fail_to_pass and pass_to_pass overlap')
    if not config.get('test_cmd') or not config.get('log_parser'):
        raise AuditError('test_cmd and log_parser are required')
    protected = config.get('protected_paths')
    if not isinstance(protected, list) or not protected or not all(isinstance(p, str) and p for p in protected):
        raise AuditError('protected_paths must contain nonempty paths')
    if len(p2p) < 100:
        warnings.append(f'{len(p2p)} P2P cases: below the 100-case target; review coverage and active swemultimodal checks')
    return len(f2p), len(p2p)


def validate_task(root: Path, warnings: list[str]) -> dict[str, object]:
    missing = [p for p in REQUIRED_TASK_PATHS if not (root / p).is_file() or not (root / p).stat().st_size]
    if missing:
        raise AuditError('task archive is missing required nonempty files: ' + ', '.join(missing))
    metadata = tomllib.loads((root / 'task.toml').read_text()).get('metadata', {})
    if metadata.get('environment_id') != 'swemultimodal':
        raise AuditError('metadata.environment_id must be swemultimodal')
    if metadata.get('category') not in {'bug_fix', 'feature', 'refactor', 'performance'}:
        raise AuditError('metadata.category must be a supported multimodal category')
    source = root / 'environment/repo'
    if not source.is_dir() or not any(source.iterdir()):
        raise AuditError('environment/repo is missing or empty')

    instruction = (root / 'instruction.md').read_text()
    reasoning = (root / 'reasoning.md').read_text()
    headings = [h.strip().casefold() for h in re.findall(r'^#{1,6}\s+(.+?)\s*#*$', reasoning, re.M)]
    if not all(h in headings for h in REASONING_HEADINGS):
        raise AuditError('reasoning.md must contain the five required sections')
    if re.search(r'\[REMOVE ME|\[TODO|\[State the task|\[What the media shows', reasoning, re.I):
        raise AuditError('reasoning.md contains an unfilled template')

    media_root = root / 'environment/media'
    media = sorted(p for p in media_root.rglob('*') if p.is_file()) if media_root.is_dir() else []
    if not media:
        raise AuditError('environment/media has no attachments')
    total = 0
    media_paths = set()
    for p in media:
        rel = p.relative_to(media_root).as_posix()
        size = p.stat().st_size
        if not size or size > 25 * MIB:
            raise AuditError(f'media file must be nonempty and at most 25 MiB: {rel}')
        if re.search(r'''[\s"'\[\]]''', rel):
            raise AuditError(f'unsupported media filename: {rel}')
        runtime_path = '/media/' + rel
        if runtime_path not in instruction:
            raise AuditError(f'instruction.md does not reference {runtime_path}')
        media_paths.add(runtime_path)
        total += size
    if total > 100 * MIB:
        raise AuditError('attachments exceed 100 MiB total')
    referenced = set(re.findall(r'/media/[^\s)\]`<>"\']+', instruction))
    unknown = referenced - media_paths
    if unknown:
        raise AuditError('instruction.md references missing media: ' + ', '.join(sorted(unknown)))

    residue = []
    for p in root.rglob('*'):
        rel = p.relative_to(root)
        if any(part in RESIDUE for part in rel.parts) or p.suffix in {'.pyc', '.pyo'} or rel.parts[0] in {'jobs','media-jobs','media-tasks'}:
            residue.append(str(rel))
        if rel.parts[0] in {'.env','.aws','.codex','.rv','.micro1-helix','media-capture-kit'}:
            residue.append(str(rel))
        if p.is_dir() and p.name == 'target' and any((p / marker).exists() for marker in ['.rustc_info.json','debug/deps','release/deps']):
            residue.append(str(rel))
        if len(rel.parts) == 1 and p.suffix.lower() == '.zip':
            residue.append(str(rel))
    if residue:
        raise AuditError('task contains generated/private residue: ' + ', '.join(sorted(set(residue))[:10]))
    commits = None
    git_bytes = 0
    if (source / '.git/HEAD').is_file():
        commits = int(run_git(source, 'rev-list', '--count', 'HEAD'))
        if commits < 10:
            raise AuditError(f'vendored repository has {commits} readable commits; minimum is 10')
        run_git(source, 'fsck', '--connectivity-only')
        git_bytes = sum(p.stat().st_size for p in (source / '.git').rglob('*') if p.is_file())
        if git_bytes > 50 * MIB:
            warnings.append(f'vendored .git is large at {git_bytes / MIB:.1f} MiB')
    else:
        warnings.append('export contains no readable upstream .git history; verify active repository-history requirements')
    f2p, p2p = validate_config(root, warnings)
    return {'task': metadata.get('instance_id', root.name), 'commits': commits,
            'git_bytes': git_bytes, 'fail_to_pass': f2p, 'pass_to_pass': p2p,
            'media_files': len(media), 'media_bytes': total}


def unpack_task(bundle: ZipFile, names: list[str], destination: Path) -> Path:
    if 'task.toml' in names:
        prefix = ''
    else:
        roots = {PurePosixPath(p).parts[0] for p in names if p.rstrip('/')}
        if len(roots) != 1:
            raise AuditError('task ZIP must contain task.toml at its root or in one enclosing directory')
        prefix = next(iter(roots))
        if prefix + '/task.toml' not in names:
            raise AuditError('task ZIP has no task.toml')
    bundle.extractall(destination)
    return destination / prefix


def audit(archive_path: Path) -> dict[str, object]:
    warnings = []
    if not archive_path.is_file():
        raise AuditError(f'archive does not exist: {archive_path}')
    try:
        with tempfile.TemporaryDirectory(prefix='swemultimodal-handoff-audit-') as temporary:
            stage = Path(temporary)
            with ZipFile(archive_path) as outer:
                names = safe_members(outer, 'handoff')
                # Accept the official Helix task ZIP directly, irrespective of its basename.
                if 'task.toml' in names or any(p.count('/') == 1 and p.endswith('/task.toml') for p in names):
                    root = unpack_task(outer, names, stage / 'task')
                    result = validate_task(root, warnings)
                    form = 'helix-task'
                else:
                    files = [p for p in names if not p.endswith('/')]
                    nested = [p for p in files if '/' not in p and p.lower().endswith('.zip')]
                    if len(nested) != 1:
                        raise AuditError('controller handoff must contain exactly one task ZIP')
                    recovery = archive_path.name.endswith('-recovery-handoff.zip')
                    required_notes = 'failure-summary.md' if recovery else 'validation-summary.md'
                    if sorted(files) != sorted([nested[0], required_notes]):
                        raise AuditError(f'handoff must contain only the task ZIP and {required_notes}')
                    if not outer.read(required_notes).strip():
                        raise AuditError(f'{required_notes} is empty')
                    nested_path = stage / 'task.zip'
                    with outer.open(nested[0]) as src, nested_path.open('wb') as dst:
                        shutil.copyfileobj(src, dst)
                    with ZipFile(nested_path) as task_zip:
                        task_names = safe_members(task_zip, 'task ZIP')
                        if recovery:
                            return {'status':'incomplete','format':'recovery','warnings':['Work in progress; not a completed task.']}
                        root = unpack_task(task_zip, task_names, stage / 'task')
                        result = validate_task(root, warnings)
                    form = 'controller-handoff'
            return {'status':'ok','format':form,**result,'warnings':warnings}
    except (BadZipFile, OSError, ValueError, subprocess.TimeoutExpired) as error:
        raise AuditError(str(error)) from error


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    try:
        result = audit(args.archive)
    except AuditError as error:
        print(json.dumps({'status':'error','error':str(error)}))
        return 1
    print(json.dumps(result))
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
