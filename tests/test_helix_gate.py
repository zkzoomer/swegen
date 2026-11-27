import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest


GATE = Path(__file__).resolve().parents[1] / 'scripts/helix_gate.py'


class HelixGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='swegen-helix-queue-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.events = self.root / 'events.jsonl'
        self.fake = self.root / 'helix.py'
        self.fake.write_text('''#!/usr/bin/env python3
import json,os,signal,sys,time
from pathlib import Path
p=Path(os.environ['EVENTS'])
name=' '.join(sys.argv[1:]) if len(sys.argv)>1 else 'help'
def record(event):
 with p.open('a') as f:f.write(json.dumps({'name':name,'event':event})+'\\n')
def cancel(signum,frame):
 record('cleanup');time.sleep(0.2);record('end');sys.exit(128+signum)
signal.signal(signal.SIGINT,cancel)
signal.signal(signal.SIGTERM,cancel)
record('start')
time.sleep(float(os.environ.get('HOLD','0.12')))
record('end')
''')
        self.fake.chmod(0o700)
        self.env = {**os.environ, 'EVENTS': str(self.events), 'SWEGEN_HELIX_GATE_LOCK': str(self.root / 'private/queue.lock')}
        self.env.pop('SWEGEN_HELIX_ACTIVE', None)

    def launch(self, name, job=None, **extra):
        env = {**self.env, 'SWEGEN_HELIX_JOB': job or name, **extra}
        p = subprocess.Popen([sys.executable, str(GATE), str(self.fake), *name.split()], env=env,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        def cleanup():
            if p.poll() is None:
                p.terminate()
                try:p.communicate(timeout=3)
                except subprocess.TimeoutExpired:p.kill();p.communicate()
        self.addCleanup(cleanup)
        return p

    def records(self):
        return [json.loads(line) for line in self.events.read_text().splitlines()] if self.events.exists() else []

    def wait_for(self, predicate):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if predicate():return
            time.sleep(0.01)
        self.fail('Timed out waiting for queue fixture')

    def test_five_independent_processes_never_overlap(self):
        processes = [self.launch(f'job-{i}') for i in range(5)]
        outputs = [p.communicate(timeout=8) for p in processes]
        self.assertTrue(all(p.returncode == 0 for p in processes), outputs)
        active = set()
        for item in self.records():
            if item['event'] == 'start':
                self.assertFalse(active, self.records())
                active.add(item['name'])
            else:active.remove(item['name'])
        self.assertFalse(active)
        self.assertTrue(any('Waiting for another local Helix' in stderr for _, stderr in outputs))

    def test_cancellation_holds_queue_until_native_cleanup_finishes(self):
        first = self.launch('first', HOLD='10')
        self.wait_for(lambda: any(x['event'] == 'start' for x in self.records()))
        second = self.launch('second')
        time.sleep(0.12)
        first.send_signal(signal.SIGINT)
        first.communicate(timeout=5)
        second.communicate(timeout=5)
        self.assertEqual(first.returncode, 130)
        self.assertEqual(second.returncode, 0)
        events = self.records()
        self.assertLess(events.index({'name':'first','event':'end'}), events.index({'name':'second','event':'start'}))

    def test_cancelled_waiter_never_starts_helix(self):
        first = self.launch('first', HOLD='0.6')
        self.wait_for(lambda: bool(self.records()))
        second = self.launch('second')
        time.sleep(0.1)
        second.send_signal(signal.SIGTERM)
        second.communicate(timeout=3)
        first.communicate(timeout=3)
        self.assertEqual(second.returncode, 143)
        self.assertFalse(any(x['name']=='second' for x in self.records()))

    def test_same_job_does_not_deadlock_behind_its_own_author(self):
        first = self.launch('task author', job='same', HOLD='0.7')
        self.wait_for(lambda: bool(self.records()))
        second = self.launch('task oracle', job='same')
        _, stderr = second.communicate(timeout=2)
        self.assertEqual(second.returncode, 75)
        self.assertIn('Close and save', stderr)
        first.communicate(timeout=3)

    def test_nested_author_commands_fail_promptly_but_help_works(self):
        blocked = self.launch('task oracle', SWEGEN_HELIX_ACTIVE='author')
        self.assertIn('Close and save', blocked.communicate(timeout=2)[1])
        self.assertEqual(blocked.returncode, 75)
        help_command = self.launch('--help', SWEGEN_HELIX_ACTIVE='author')
        help_command.communicate(timeout=3)
        self.assertEqual(help_command.returncode, 0)

    def test_read_only_preflight_runs_while_a_writer_is_held(self):
        first = self.launch('first', HOLD='10')
        self.wait_for(lambda: bool(self.records()))
        for name in ('doctor --output json',):
            reader = self.launch(name, SWEGEN_HELIX_ACTIVE='author')
            reader.communicate(timeout=2)
            self.assertEqual(reader.returncode, 0)
            self.assertIsNone(first.poll())
        writer = self.launch('task oracle')
        time.sleep(0.12)
        self.assertFalse(any(x['name']=='task oracle' for x in self.records()))
        first.terminate()
        first.communicate(timeout=3)
        writer.communicate(timeout=3)
        self.assertEqual(writer.returncode, 0)
        events = self.records()
        self.assertLess(events.index({'name':'first','event':'end'}), events.index({'name':'task oracle','event':'start'}))

    def test_task_status_serializes_with_other_helix_state_writers(self):
        first = self.launch('first', HOLD='0.5')
        self.wait_for(lambda: bool(self.records()))
        second = self.launch('task status --output json')
        time.sleep(0.12)
        self.assertFalse(any(x['name']=='task status --output json' for x in self.records()))
        first.communicate(timeout=3)
        second.communicate(timeout=3)
        self.assertEqual(second.returncode, 0)
        events = self.records()
        self.assertLess(events.index({'name':'first','event':'end'}), events.index({'name':'task status --output json','event':'start'}))

        nested = self.launch('task status --output json', SWEGEN_HELIX_ACTIVE='author')
        self.assertIn('Close and save', nested.communicate(timeout=2)[1])
        self.assertEqual(nested.returncode, 75)

    def test_unrecognized_diagnostic_options_still_queue(self):
        first = self.launch('first', HOLD='0.5')
        self.wait_for(lambda: bool(self.records()))
        second = self.launch('doctor --repair')
        time.sleep(0.12)
        self.assertFalse(any(x['name']=='doctor --repair' for x in self.records()))
        first.communicate(timeout=3)
        second.communicate(timeout=3)
        events = self.records()
        self.assertLess(events.index({'name':'first','event':'end'}), events.index({'name':'doctor --repair','event':'start'}))

    def test_stale_metadata_without_a_live_lock_does_not_block_restart(self):
        lock = Path(self.env['SWEGEN_HELIX_GATE_LOCK'])
        lock.parent.mkdir()
        lock.write_text(json.dumps({'job':'same','operation':'task author','pid':99999999}))
        p = self.launch('task oracle', job='same')
        p.communicate(timeout=3)
        self.assertEqual(p.returncode, 0)
        self.assertEqual(lock.read_bytes(), b'')


if __name__ == '__main__':
    unittest.main()
