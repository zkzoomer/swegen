#!/usr/bin/env python3
"""Adapt a private generated capture Dockerfile to the preloaded browser bundle."""
import argparse
import json
from pathlib import Path
import re
from capture_browser_bundle import IMAGE, VERSION

MARKER = '# swegen: preloaded capture browsers'


def adapt(text):
    if MARKER in text:
        if f'COPY --from={IMAGE} ' not in text or 'PLAYWRIGHT_BROWSERS_PATH=/ms-playwright' not in text:
            raise ValueError('Existing capture browser configuration is inconsistent')
        return text
    versions = re.findall(r'playwright==([\d.]+)', text)
    if not versions or any(value != VERSION for value in versions):
        raise ValueError('Capture Dockerfile must use the kit\'s pinned Playwright ' + VERSION)
    pattern = r'(?<!\S)(?:python3? -m )?playwright install --with-deps chromium firefox\b'
    updated, count = re.subn(pattern, 'playwright install-deps chromium firefox', text)
    if count != 1:
        raise ValueError('Expected exactly one known capture-kit browser installation; preserve unknown Dockerfiles')
    return updated.rstrip() + f'\n\n{MARKER}\nCOPY --from={IMAGE} /ms-playwright/ /ms-playwright/\nENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('environment', type=Path)
    parser.add_argument('--receipt', type=Path, default=Path('/opt/swegen/capture-browser-ready.json'))
    args = parser.parse_args()
    environment = args.environment.resolve()
    roots = [Path('/home/daytona/capture-staging'), Path('/home/daytona/author-staging')]
    if not any(environment.is_relative_to(root) for root in roots):
        raise ValueError('Only disposable private capture environments may be adapted')
    receipt = json.loads(args.receipt.read_text())
    if receipt.get('installed') is not True or receipt.get('image') != IMAGE or receipt.get('version') != VERSION:
        raise ValueError('Preloaded capture browser image has not been verified on this worker')
    dockerfile = environment / 'Dockerfile'
    if dockerfile.is_symlink():
        raise ValueError('Capture Dockerfile must not be a symlink')
    original = dockerfile.read_text()
    replacement = adapt(original)
    dockerfile.write_text(replacement)
    print(json.dumps({'dockerfile': str(dockerfile), 'image': IMAGE, 'changed': replacement != original}))


if __name__ == '__main__':
    main()
