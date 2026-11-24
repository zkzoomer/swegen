#!/usr/bin/env python3
"""Private PTY transport. The parent owns screen rendering and session logging."""
import base64
import errno
import fcntl
import json
import os
import pty
import select
import signal
import struct
import sys
import termios


def emit(record):
    print(json.dumps(record), flush=True)


def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: author_pty.py COMMAND [ARGS...]')
    status_read, status_write = os.pipe()
    os.set_inheritable(status_write, True)
    pid, master = pty.fork()
    if pid == 0:
        os.close(status_read)
        os.environ['SWEGEN_AUTHOR_STATUS_FD'] = str(status_write)
        os.environ['TERM'] = 'xterm-256color'
        os.execvp(sys.argv[1], sys.argv[1:])
    os.close(status_write)
    os.set_blocking(status_read, False)
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 160, 0, 0))

    def terminate(signum, frame):
        try:
            os.killpg(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    signal.signal(signal.SIGTERM, terminate)
    pending = b''
    stdin_open = True
    pty_open = True
    status_open = True
    status_pending = b''

    def read_status():
        nonlocal status_pending, status_open
        try:
            data = os.read(status_read, 4096)
        except BlockingIOError:
            return
        if not data:
            status_open = False
        status_pending += data
        while b'\n' in status_pending:
            line, status_pending = status_pending.split(b'\n', 1)
            event = json.loads(line)
            if event.get('type') in ('helix_queued', 'helix_started'):
                emit(event)

    while pty_open:
        readable, _, _ = select.select(([0] if stdin_open else []) + [master] + ([status_read] if status_open else []), [], [], 0.2)
        if status_read in readable:
            read_status()
        if 0 in readable:
            chunk = os.read(0, 65536)
            if not chunk:
                stdin_open = False
                terminate(None, None)
            pending += chunk
            while b'\n' in pending:
                line, pending = pending.split(b'\n', 1)
                request = json.loads(line)
                if request['type'] == 'input':
                    os.write(master, base64.b64decode(request['data']))
                elif request['type'] == 'terminate':
                    terminate(None, None)
        if master in readable:
            try:
                data = os.read(master, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                data = b''
            if data:
                emit({'type': 'output', 'data': base64.b64encode(data).decode()})
            else:
                pty_open = False
    # Drain trusted launch events before exit, including a queued cancellation race.
    while status_open:
        previous = status_pending
        read_status()
        if status_open and previous == status_pending:
            break
    os.close(status_read)
    _, status = os.waitpid(pid, 0)
    emit({'type': 'exit', 'code': os.waitstatus_to_exitcode(status)})


if __name__ == '__main__':
    main()
