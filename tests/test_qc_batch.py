import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('qc_batch', ROOT / 'scripts/qc_batch.py')
qc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qc)
spec = importlib.util.spec_from_file_location('probe_preflight', ROOT / 'scripts/probe_preflight.py')
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


class QcBatchTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.task = self.root / 'snapshot-one'
        self.task.mkdir()
        (self.task / 'instruction.md').write_text('original task')
        binary = self.root / 'bin'
        binary.mkdir()
        rv = binary / 'rv'
        rv.write_text('''#!/usr/bin/env python3
import json, os, pathlib, sys, time
args=sys.argv[1:]
if os.environ.get('QC_FIXTURE_EXPECT_TMP'):
 temporary=pathlib.Path(os.environ['TMPDIR'])
 assert temporary.parent==pathlib.Path(os.environ['QC_FIXTURE_EXPECT_TMP'])
 (temporary/'actual-subprocess-temp-proof').write_text('temporary storage inherited')
task=pathlib.Path(args[1])
assert not (task/'mutated').exists(), 'Lanes share writable files'
(task/'mutated').write_text('private execution copy')
time.sleep(.03)
if '--stage' in args: ids=['swemultimodal/tests-contract','swemultimodal/tests-observable']
elif '--until' in args: ids=['template-compatible']
else: ids=[args[i+1] for i,value in enumerate(args) if value=='--check']
error=os.environ.get('QC_FIXTURE_ERROR')=='yes'
print(json.dumps({'records':[{'check_id':check,'status':'error' if error else 'completed',
 'output':None if error else {'outcome':'passed','flagged':False},
 'error':'fixture authentication error' if error else None} for check in ids]}))
sys.exit(1 if error else 0)
''')
        rv.chmod(0o755)
        self.environment = patch.dict(os.environ, {'PATH': str(binary) + os.pathsep + os.environ['PATH']})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def test_initial_lanes_have_isolated_inputs_and_preserve_raw_results(self):
        root = self.root / 'qc'
        qc.run_batch(self.task, root, ['preflight'])
        batch = qc.run_batch(self.task, root)
        self.assertEqual(len(batch['lanes']), 5)
        self.assertEqual((self.task / 'instruction.md').read_text(), 'original task')
        self.assertFalse((self.task / 'mutated').exists())
        copies = list((root / 'runs').glob('*/**/task/mutated'))
        self.assertEqual(len(copies), 6)
        for lane in batch['lanes']:
            self.assertEqual(lane['exit_code'], 0)
            self.assertTrue(json.loads((root / lane['result']).read_text())['records'])
        reused = qc.run_batch(self.task, root, ['swemultimodal/probe-gameability'])
        self.assertEqual(reused['status'], 'reused')
        self.assertEqual(json.loads((root / 'ledger.json').read_text())['attempts']['swemultimodal/probe-gameability'], 1)
        with self.assertRaisesRegex(ValueError, 'already ran'):
            qc.run_batch(self.task, root, ['judgment'])

    def test_errors_and_snapshot_changes_do_not_reset_attempts(self):
        root = self.root / 'qc'
        with patch.dict(os.environ, {'QC_FIXTURE_ERROR': 'yes'}):
            qc.run_batch(self.task, root)
        with patch.dict(os.environ, {'QC_FIXTURE_ERROR': 'yes'}):
            for _ in range(5):
                qc.run_batch(self.task, root, ['swemultimodal/probe-gameability'])
        self.task.rename(self.root / 'snapshot-two')
        with self.assertRaisesRegex(ValueError, 'Retry limit'):
            qc.run_batch(self.root / 'snapshot-two', root, ['swemultimodal/probe-gameability'])
        ledger = json.loads((root / 'ledger.json').read_text())
        self.assertEqual(ledger['attempts']['swemultimodal/probe-gameability'], 6)
        self.assertEqual(ledger['attempts']['swemultimodal/probe-altsolve'], 1)
        qc.run_batch(self.root / 'snapshot-two', root, ['swemultimodal/tests-contract'])
        self.assertEqual(json.loads((root / 'ledger.json').read_text())['attempts']['swemultimodal/tests-contract'], 2)

    def test_generic_explicit_checks_use_native_selectors_and_shared_retry_limit(self):
        root = self.root / 'qc'
        selected = ['instruction-non-empty', 'dockerfile-has-from']
        with patch.dict(os.environ, {'QC_FIXTURE_ERROR': 'yes'}):
            for _ in range(6):
                batch = qc.run_batch(self.task, root, selected)
        self.assertEqual(len(batch['lanes']), 1)
        lane = batch['lanes'][0]
        self.assertNotIn('--stage', lane['command'])
        self.assertNotIn('--until', lane['command'])
        self.assertEqual(lane['checks'], selected)
        self.assertEqual([r['check_id'] for r in lane['records']], selected)
        ledger = json.loads((root / 'ledger.json').read_text())
        self.assertEqual(ledger['initial_judgment'], 0)
        self.assertEqual(ledger['attempts']['instruction-non-empty'], 6)
        with self.assertRaisesRegex(ValueError, 'Retry limit'):
            qc.run_batch(self.task, root, selected)

    def test_rejects_invalid_explicit_selectors(self):
        for selector in ['../instruction-non-empty', '--stage', 'other/check', '', 'bad name']:
            with self.subTest(selector=selector), self.assertRaisesRegex(ValueError, 'Select preflight'):
                qc.run_batch(self.task, self.root / 'qc', [selector])

    def test_configured_temporary_storage_is_outside_inputs_and_retains_normal_ledger(self):
        root = self.root / 'qc'
        root.mkdir()
        temporary = self.root / 'large-volume' / 'qc-temp'
        (root / 'runtime-config.json').write_text(json.dumps({'tmp_root': str(temporary)}))
        with patch.dict(os.environ, {'QC_FIXTURE_EXPECT_TMP': str(temporary)}):
            batch = qc.run_batch(self.task, root, ['instruction-non-empty'])
        lane = batch['lanes'][0]
        self.assertEqual(Path(lane['temporary_directory']).parent, temporary)
        self.assertEqual((Path(lane['temporary_directory']) / 'actual-subprocess-temp-proof').read_text(), 'temporary storage inherited')
        self.assertTrue(Path(lane['temporary_directory']).is_dir())
        self.assertEqual(json.loads((root / 'ledger.json').read_text())['attempts']['instruction-non-empty'], 1)
        self.assertFalse((self.task / 'mutated').exists())

    def test_temporary_storage_cannot_overlap_task_or_reset_ledger(self):
        root = self.root / 'qc'
        root.mkdir()
        (root / 'runtime-config.json').write_text(json.dumps({'tmp_root': str(self.task / 'tmp')}))
        with self.assertRaisesRegex(ValueError, 'temporary storage and task inputs must be separate'):
            qc.run_batch(self.task, root)
        self.assertFalse((root / 'ledger.json').exists())

    def test_rejects_overlapping_execution_and_input_directories(self):
        with self.assertRaisesRegex(ValueError, 'separate'):
            qc.run_batch(self.task, self.task / 'generated')

    def test_subscription_preflight_uses_private_login_and_closed_stdin(self):
        codex = self.root / 'bin/codex'
        codex.write_text('''#!/usr/bin/env python3
import os,pathlib,sys
assert sys.stdin.read()==''
assert 'OPENAI_API_KEY' not in os.environ and 'CODEX_API_KEY' not in os.environ
assert os.environ['CODEX_FORCE_AUTH_JSON']=='1'
pathlib.Path(sys.argv[sys.argv.index('--output-last-message')+1]).write_text('OK')
''')
        codex.chmod(0o755)
        with patch.dict(os.environ, {'OPENAI_API_KEY': 'unused-fixture-secret', 'CODEX_API_KEY': 'unused-fixture-secret'}):
            preflight.check_login('fixture-model', self.root / 'preflight')
        self.assertEqual(list((self.root / 'preflight').glob('codex-auth-*')), [])


if __name__ == '__main__':
    unittest.main()
