#!/usr/bin/env python3
"""Queue local Helix commands without changing Helix's own locks or sync state."""
import fcntl
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import time


def author_status(event):
    """Private PTY control pipe, deliberately not inherited by the Helix child."""
    if os.environ.get('SWEGEN_AUTHOR_STATUS_FD'):
        try:
            os.write(int(os.environ['SWEGEN_AUTHOR_STATUS_FD']), (json.dumps({'type': event}) + '\n').encode())
        except (OSError, ValueError):
            pass


def operation(args):
    if 'task' in args:
        at = args.index('task')
        return ' '.join(args[at:at + 2])
    return args[0] if args else 'help'


def read_only(args):
    """Doctor can bypass the queue; task status opens Helix's state writer."""
    args = list(args)
    if args[-2:] == ['--output', 'json']:
        args = args[:-2]
    return args == ['doctor']


def main():
    executable, *args = sys.argv[1:]
    # These do not take Helix's writer and remain usable inside an author session.
    if not args or any(arg in ('--help', '-h', '--version') for arg in args) or args[0] in ('help', 'version'):
        os.execv(executable, [executable, *args])
    if read_only(args):
        env = os.environ.copy()
        env.pop('SWEGEN_AUTHOR_STATUS_FD', None)
        os.execve(executable, [executable, *args], env)
    if os.environ.get('SWEGEN_HELIX_ACTIVE'):
        print('Close and save the active Helix author session before running another Helix command.', file=sys.stderr)
        return 75

    lock_path = Path(os.environ['SWEGEN_HELIX_GATE_LOCK'])
    lock_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
    if not stat.S_ISREG(os.fstat(fd).st_mode) or os.fstat(fd).st_uid != os.getuid():
        os.close(fd)
        raise RuntimeError('Helix queue lock must be a regular file owned by the current user')
    child = None
    cancelled = 0

    def cancel(signum, _frame):
        nonlocal cancelled
        cancelled = signum
        if child is not None and child.poll() is None:
            # PTY signals already reach the whole foreground group. Non-TTY
            # controller cancellation targets this wrapper and needs forwarding.
            if not os.isatty(0):
                try:
                    child.send_signal(signum)
                except ProcessLookupError:
                    pass

    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        signal.signal(signum, cancel)
    acquired = False
    waiting = False
    job = os.environ.get('SWEGEN_HELIX_JOB', '')
    deadline = time.monotonic() + 14400
    try:
        while not acquired:
            if cancelled:
                return 128 + cancelled
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                acquired = True
            except BlockingIOError:
                try:
                    owner = json.loads(os.pread(fd, 4096, 0))
                except (ValueError, OSError):
                    owner = {}
                if job and owner.get('job') == job and owner.get('operation') == 'task author':
                    print('Close and save this job\'s active author session before requesting another Helix command.', file=sys.stderr)
                    return 75
                if not waiting:
                    author_status('helix_queued')
                    print('[swegen] Waiting for another local Helix operation to finish; remote compute can continue.', file=sys.stderr, flush=True)
                    waiting = True
                if time.monotonic() >= deadline:
                    raise TimeoutError('Timed out waiting for the shared local Helix queue')
                time.sleep(0.1)
        if cancelled:
            return 128 + cancelled
        owner = json.dumps({'pid': os.getpid(), 'job': job, 'operation': operation(args)}).encode()
        os.ftruncate(fd, 0)
        os.pwrite(fd, owner, 0)
        if waiting:
            print('[swegen] Local Helix queue acquired.', file=sys.stderr, flush=True)
        env = os.environ.copy()
        env.pop('SWEGEN_AUTHOR_STATUS_FD', None)
        if operation(args) == 'task author':
            env['SWEGEN_HELIX_ACTIVE'] = 'author'
        author_status('helix_started')
        child = subprocess.Popen([executable, *args], env=env)
        if cancelled and not os.isatty(0):
            child.send_signal(cancelled)
        code = child.wait()
        return code if code >= 0 else 128 - code
    finally:
        # Hold the queue until Helix has finished cleanup, including cancellation.
        if child is not None and child.poll() is None:
            child.terminate()
            child.wait()
        if acquired:
            os.ftruncate(fd, 0)
        os.close(fd)


if __name__ == '__main__':
    sys.exit(main())
