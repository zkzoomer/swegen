#!/usr/bin/env python3
"""Read-only guard against losing relocated worker/QC state after a restart."""
import hashlib
import json
import os
from pathlib import Path
import re
import sys

LAYOUT = {
    '/home/daytona': 'daytona',
    '/root/.cache': 'root-cache',
    '/root/.daytona': 'daytona-sessions',
    '/root/.docker': 'docker-cli',
}


def check_storage(worker_id, storage_root=Path('/var/lib/docker'), samefile=os.path.samefile):
    if not re.fullmatch(r'[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}', worker_id):
        raise ValueError('Expected the assigned worker UUID')
    prefix = storage_root / ('swegen-recovery-' + worker_id[:8])
    marker = prefix / 'relocation-marker.json'
    if not marker.exists():
        if any((prefix / name).exists() for name in LAYOUT.values()):
            raise ValueError('Incomplete storage relocation: preserve state and inspect the recovery directory before bootstrap')
        return {'storage': 'standard', 'worker_id': worker_id}
    if marker.is_symlink() or not marker.is_file():
        raise ValueError('Storage marker must be a regular file')
    data = json.loads(marker.read_text())
    if data.get('worker_id') != worker_id:
        raise ValueError('Storage marker belongs to another worker')
    mounts = data.get('mounts')
    if not isinstance(mounts, dict) or '/home/daytona' not in mounts or not set(mounts) <= set(LAYOUT):
        raise ValueError('Unexpected relocated storage targets')
    for target, source in mounts.items():
        expected = prefix / LAYOUT[target]
        if source != str(expected) or expected.is_symlink() or not expected.is_dir() or expected.resolve() != expected:
            raise ValueError('Unexpected relocated storage source for ' + target)
        try:
            matches = samefile(target, str(expected))
        except OSError:
            matches = False
        if not matches:
            raise ValueError('Storage bind missing or wrong for ' + target + '; restore the verified current layout before any QC state access. Never initialize from the stale backup.')
    ledger = prefix / 'daytona/author-staging/qc/ledger.json'
    raw = ledger.read_bytes()
    state = json.loads(raw)
    counts = state.get('attempts')
    if not isinstance(counts, dict) or not isinstance(state.get('batches'), list):
        raise ValueError('Canonical relocated QC ledger is missing or invalid')
    for count in [state.get('initial_judgment'), *counts.values()]:
        if type(count) is not int or count < 0:
            raise ValueError('Canonical relocated QC counters are invalid')
    # before_move_ledger_sha256 is historical. The canonical ledger is expected
    # to advance; never replace it with that older receipt or reset any counter.
    return {'storage': 'verified_relocation', 'worker_id': worker_id,
            'ledger_sha256': hashlib.sha256(raw).hexdigest(),
            'initial_judgment': state['initial_judgment'], 'attempts': counts,
            'read_only': True}


if __name__ == '__main__':
    try:
        print(json.dumps(check_storage(sys.argv[1])))
    except Exception as error:
        print('Worker storage recovery required: ' + str(error), file=sys.stderr)
        raise SystemExit(1)
