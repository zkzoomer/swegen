#!/usr/bin/env python3
"""Run isolated rv lanes and retain raw results, retry counts and a compact receipt."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import tempfile
from uuid import uuid4

PROBES = ('gameability', 'altsolve', 'leakage', 'media-ablation')
INITIAL = ('judgment',) + tuple('swemultimodal/probe-' + p for p in PROBES)


def save(file, value):
    temporary = file.with_suffix('.tmp')
    temporary.write_text(json.dumps(value, indent=2) + '\n')
    temporary.replace(file)


def now():
    return datetime.now(timezone.utc).isoformat()


def run_batch(task, root, checks=None):
    task, root = task.resolve(strict=True), root.resolve()
    if root == task or task in root.parents or root in task.parents:
        raise ValueError('QC output and task inputs must be separate directories')
    root.mkdir(parents=True, exist_ok=True)
    temporary_root = None
    runtime_file = root / 'runtime-config.json'
    if runtime_file.exists():
        runtime = json.loads(runtime_file.read_text())
        if not isinstance(runtime, dict) or set(runtime) != {'tmp_root'} or not isinstance(runtime['tmp_root'], str):
            raise ValueError('QC runtime config must contain only an absolute tmp_root')
        temporary_root = Path(runtime['tmp_root'])
        if not temporary_root.is_absolute():
            raise ValueError('QC tmp_root must be absolute')
        temporary_root = temporary_root.resolve()
        if temporary_root == task or task in temporary_root.parents or temporary_root in task.parents:
            raise ValueError('QC temporary storage and task inputs must be separate')
        temporary_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with (root / 'lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        ledger_file = root / 'ledger.json'
        ledger = json.loads(ledger_file.read_text()) if ledger_file.exists() else {
            'initial_judgment': 0, 'attempts': {}, 'batches': []}
        selections = list(dict.fromkeys(checks or INITIAL))
        if not selections or any(c not in ('judgment', 'preflight') and
                                 not re.fullmatch(r'(?:swemultimodal/)?[a-z0-9][a-z0-9-]*', c) for c in selections):
            raise ValueError('Select preflight, the initial judgment stage, or explicit generic/swemultimodal check IDs')
        if 'preflight' in selections and len(selections) != 1:
            raise ValueError('Run static preflight separately from model checks')
        if any(c.startswith('swemultimodal/probe-') and c.removeprefix('swemultimodal/probe-') not in PROBES for c in selections):
            raise ValueError('Unknown multimodal probe')
        if 'judgment' in selections and any(c != 'judgment' and not c.startswith('swemultimodal/probe-') for c in selections):
            raise ValueError('Do not combine the judgment stage and individual judge IDs')
        if 'judgment' in selections and any(lane.get('checks') == ['judgment'] and lane.get('records')
                                            for batch in ledger['batches'] for lane in batch.get('lanes', [])):
            raise ValueError('The full judgment stage already ran; retry only affected check IDs')
        observed = {}
        for batch in ledger['batches']:
            for check in batch['checks']:
                observed.pop(check, None)
            for lane in batch.get('lanes', []):
                for record in lane.get('records', []):
                    observed[record['check_id']] = (batch['snapshot'], record)
        reused = []
        for check in selections:
            snapshot, record = observed.get(check, (None, {}))
            if snapshot == task.name and record.get('status') == 'completed' and record.get('outcome') == 'passed' and not record.get('flagged'):
                reused.append(check)
        selections = [check for check in selections if check not in reused]
        if not selections:
            return {'status': 'reused', 'snapshot': task.name, 'checks': reused}
        for check in selections:
            count = ledger['attempts'].get(check, ledger['initial_judgment'] if not check.startswith('swemultimodal/probe-') else 0)
            if check == 'judgment':
                count = ledger['initial_judgment']
            if check != 'preflight' and count >= 6:
                raise ValueError('Retry limit exhausted: ' + check)
        lanes = {}
        for check in selections:
            lane = check.removeprefix('swemultimodal/probe-') if check.startswith('swemultimodal/probe-') else (
                check if check in ('judgment', 'preflight') else 'judgment')
            lanes.setdefault(lane, []).append(check)
        sequence = len(ledger['batches'])
        directory = root / 'runs' / f'{sequence:04d}-{uuid4().hex[:8]}'
        directory.mkdir(parents=True)
        # Clone every input before admitting any process. Never share mutable files.
        for lane in lanes:
            shutil.copytree(task, directory / lane / 'task')
        for check in selections:
            if check == 'judgment':
                ledger['initial_judgment'] += 1
            elif check != 'preflight':
                base = ledger['initial_judgment'] if not check.startswith('swemultimodal/probe-') else 0
                ledger['attempts'][check] = ledger['attempts'].get(check, base) + 1
        batch = {'sequence': sequence, 'snapshot': task.name, 'started': now(),
                 'checks': selections, 'status': 'running', 'lanes': []}
        ledger['batches'].append(batch)
        save(ledger_file, ledger)  # Reserve attempts before execution, including failed calls.

        def run_lane(item):
            lane, chosen = item
            output = directory / lane
            command = ['rv', 'check', str(output / 'task')]
            if chosen == ['judgment']:
                command += ['--stage', 'judgment']
            elif chosen == ['preflight']:
                command += ['--until', 'harness']
            else:
                for check in chosen:
                    command += ['--check', check]
            command += ['--executor', 'docker', '--no-cache', '--no-color', '--json']
            environment = None
            temporary_directory = None
            if temporary_root is not None:
                temporary_directory = tempfile.mkdtemp(prefix=lane + '-', dir=temporary_root)
                environment = dict(os.environ, TMPDIR=temporary_directory)
            started = time.monotonic()
            with (output / 'result.json').open('w') as stdout, (output / 'stderr.log').open('w') as stderr:
                try:
                    code = subprocess.run(command, cwd=output, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, env=environment).returncode
                except OSError as error:
                    stderr.write(str(error))
                    code = 127
            receipt = {'lane': lane, 'checks': chosen, 'command': command, 'exit_code': code,
                       'seconds': round(time.monotonic() - started, 3), 'ended': now(), 'records': []}
            if temporary_directory is not None:
                receipt['temporary_directory'] = temporary_directory
            try:
                raw = json.loads((output / 'result.json').read_text())
                for record in raw['records']:
                    value = record.get('output') or {}
                    receipt['records'].append({'check_id': record['check_id'], 'status': record['status'],
                                               'outcome': value.get('outcome'), 'flagged': value.get('flagged')})
            except (ValueError, KeyError, TypeError) as error:
                receipt['execution_error'] = 'Missing/invalid rv JSON: ' + str(error)
            if lane in PROBES:
                attempts = ledger['attempts']['swemultimodal/probe-' + lane]
                suffix = 'initial' if attempts == 1 else f'final-rerun{attempts - 1}'
            else:
                suffix = 'initial' if chosen == ['judgment'] and ledger['initial_judgment'] == 1 or sequence == 0 else f'final-rerun{sequence}'
            canonical = root / f'{lane}-{suffix}.json'
            shutil.copyfile(output / 'result.json', canonical)
            receipt['result'] = canonical.name
            save(output / 'receipt.json', receipt)
            return receipt

        with ThreadPoolExecutor(max_workers=5) as pool:
            batch['lanes'] = list(pool.map(run_lane, lanes.items()))
        for lane in batch['lanes']:
            if 'judgment' in selections and lane['lane'] == 'judgment':
                for record in lane['records']:
                    ledger['attempts'].setdefault(record['check_id'], ledger['initial_judgment'])
        batch.update(status='finished', ended=now())
        save(ledger_file, ledger)
        save(root / 'summary.json', batch)
        return batch


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('task', type=Path)
    parser.add_argument('root', type=Path)
    parser.add_argument('--checks', help='Comma-separated check IDs; omit for the initial five lanes')
    args = parser.parse_args()
    print(json.dumps(run_batch(args.task, args.root, args.checks.split(',') if args.checks else None), indent=2))


if __name__ == '__main__':
    main()
