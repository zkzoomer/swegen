#!/usr/bin/env python3
"""Exercise the worker Codex subscription once before task construction or probes."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def check_login(model, directory):
    directory.mkdir(parents=True, exist_ok=True)
    environment = dict(os.environ, CODEX_FORCE_AUTH_JSON='1')
    for key in ('OPENAI_API_KEY', 'CODEX_API_KEY'):
        environment.pop(key, None)
    with tempfile.TemporaryDirectory(prefix='codex-auth-', dir=directory) as temporary:
        reply = Path(temporary) / 'reply.txt'
        command = ['codex', 'exec', '--ephemeral', '--skip-git-repo-check', '--model', model,
                   '--sandbox', 'read-only', '--color', 'never', '--output-last-message', str(reply),
                   'Reply only with OK. Do not run tools or inspect files.']
        with (directory / 'codex-auth.stderr.log').open('w') as stderr:
            try:
                result = subprocess.run(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                        stderr=stderr, env=environment, cwd=temporary, timeout=90)
            except subprocess.TimeoutExpired as error:
                raise RuntimeError('Codex subscription preflight timed out; inspect private preflight logs') from error
        if result.returncode or not reply.exists() or reply.read_text().strip() != 'OK':
            raise RuntimeError('Codex subscription preflight failed; inspect private preflight logs')
    print('Live Codex subscription preflight passed')


if __name__ == '__main__':
    check_login(sys.argv[1], Path('/home/daytona/author-staging/preflight'))
