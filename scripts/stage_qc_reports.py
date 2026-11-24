#!/usr/bin/env python3
"""Restore rv's original Markdown reports from saved JSON into qc_artifacts."""
import argparse
import base64
import hashlib
import json
from pathlib import Path, PurePosixPath
import re

PROBES = ('gameability', 'altsolve', 'leakage', 'media-ablation')
RESULT_NAME = re.compile(r'^(judgment|gameability|altsolve|leakage|media-ablation)-(initial|[a-z-]*rerun(\d+))\.json$')


def stage_reports(staging, task):
    latest = {}
    for source in sorted(staging.glob('*.json')):
        match = RESULT_NAME.fullmatch(source.name)
        if not match:
            continue
        attempt = int(match[3] or 0)
        report = json.loads(source.read_text())
        for record in report.get('records', []):
            # Explicit static selectors share the wrapper's judgment result lane,
            # but official rv marks them files/repo/etc. They have no Markdown
            # judge report; preserve them in raw QC evidence rather than staging
            # invented artifacts or letting them replace a real judge verdict.
            if match[1] == 'judgment' and record.get('stage') not in (None, 'judgment'):
                continue
            check = record.get('check_id', '')
            if not re.fullmatch(r'swemultimodal/[a-z0-9-]+', check):
                raise ValueError(f'Unexpected check ID in {source.name}: {check}')
            if check.startswith('swemultimodal/probe-'):
                lane = check.removeprefix('swemultimodal/probe-')
                if lane not in PROBES or match[1] != lane:
                    raise ValueError(f'Unexpected probe in {source.name}: {check}')
                relative = f'probes/{lane}.md'
            else:
                if match[1] != 'judgment':
                    raise ValueError(f'Unexpected judgment in {source.name}: {check}')
                relative = f'judges/{check}.md'
            if check not in latest or attempt > latest[check][0]:
                latest[check] = (attempt, source, record, relative)
    missing = [lane for lane in PROBES if f'swemultimodal/probe-{lane}' not in latest]
    if missing:
        raise ValueError('Missing probe results: ' + ', '.join(missing))
    outputs = []
    prepared = []
    for check, (attempt, source, record, relative) in sorted(latest.items()):
        artifacts = (record.get('output') or {}).get('artifacts', [])
        matching = [a for a in artifacts if a.get('path') == relative]
        if len(matching) == 1:
            data = base64.b64decode(matching[0]['data'], altchars=b'-_', validate=True)
            if not data.strip() or len(data) > 2 * 1024 * 1024:
                raise ValueError(f'Empty or oversized report: {relative}')
            data.decode('utf8')
        elif record.get('status') == 'error':
            data = (f'# {check}\n\nStatus: execution error; no probe verdict was produced.\n\n'
                    f'Source: {source.name}\n\n{record.get("error", "No error detail supplied")}\n').encode()
        else:
            raise ValueError(f'Missing original Markdown artifact in {source.name}: {relative}')
        # Derive destinations from validated IDs, never from arbitrary artifact paths.
        destination = task / 'qc_artifacts' / PurePosixPath(relative)
        prepared.append((destination, data))
        outputs.append({'path': f'qc_artifacts/{relative}', 'source': source.name,
                        'batch_sequence': attempt, 'check_id': check,
                        'outcome': (record.get('output') or {}).get('outcome', record.get('status')),
                        'sha256': hashlib.sha256(data).hexdigest()})
    for destination, data in prepared:
        if destination.is_symlink() or any(p.is_symlink() for p in destination.parents):
            raise ValueError(f'Refusing symlink destination: {destination}')
    for destination, data in prepared:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    return {'reports': outputs, 'probe_count': len(PROBES), 'judge_count': len(outputs) - len(PROBES)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('staging', type=Path)
    parser.add_argument('task', type=Path)
    args = parser.parse_args()
    print(json.dumps(stage_reports(args.staging, args.task), indent=2))


if __name__ == '__main__':
    main()
