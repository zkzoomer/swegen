import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('worker_storage', Path(__file__).parents[1] / 'scripts/check_worker_storage.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
WORKER = '54c96449-b58a-416c-9f6b-9048cea54203'


class WorkerStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.prefix = self.root / 'swegen-recovery-54c96449'

    def relocated(self):
        mounts = {target: str(self.prefix / name) for target, name in module.LAYOUT.items()}
        for source in mounts.values():
            Path(source).mkdir(parents=True)
        ledger = self.prefix / 'daytona/author-staging/qc/ledger.json'
        ledger.parent.mkdir(parents=True)
        ledger.write_text(json.dumps({'initial_judgment': 1, 'attempts': {'swemultimodal/probe-gameability': 1}, 'batches': []}))
        marker = self.prefix / 'relocation-marker.json'
        marker.write_text(json.dumps({'worker_id': WORKER, 'mounts': mounts, 'before_move_ledger_sha256': '0' * 64}))
        return marker, ledger

    def test_standard_worker_needs_no_recovery_and_writes_nothing(self):
        self.assertEqual(module.check_storage(WORKER, self.root)['storage'], 'standard')
        self.assertEqual(list(self.root.iterdir()), [])

    def test_progressed_canonical_ledger_is_preserved_not_replaced_by_historical_receipt(self):
        _, ledger = self.relocated()
        original = ledger.read_bytes()
        report = module.check_storage(WORKER, self.root, lambda target, source: True)
        self.assertEqual(report['storage'], 'verified_relocation')
        self.assertEqual(report['attempts']['swemultimodal/probe-gameability'], 1)
        self.assertEqual(report['ledger_sha256'], hashlib.sha256(original).hexdigest())
        self.assertEqual(ledger.read_bytes(), original)
        self.assertTrue(report['read_only'])

    def test_missing_bind_fails_before_reading_or_reinitializing_ledger(self):
        _, ledger = self.relocated()
        ledger.unlink()
        with self.assertRaisesRegex(ValueError, 'bind missing or wrong'):
            module.check_storage(WORKER, self.root, lambda target, source: False)
        self.assertFalse(ledger.exists())

    def test_partial_recovery_and_unexpected_source_are_rejected(self):
        (self.prefix / 'daytona').mkdir(parents=True)
        with self.assertRaisesRegex(ValueError, 'Incomplete storage relocation'):
            module.check_storage(WORKER, self.root)
        (self.prefix / 'daytona').rmdir()
        marker, _ = self.relocated()
        data = json.loads(marker.read_text())
        data['mounts']['/home/daytona'] = '/other-worker/daytona'
        marker.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'Unexpected relocated storage source'):
            module.check_storage(WORKER, self.root, lambda target, source: True)

    def test_wrong_worker_or_extra_target_is_rejected(self):
        marker, _ = self.relocated()
        data = json.loads(marker.read_text()); data['worker_id'] = 'other'
        marker.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'another worker'):
            module.check_storage(WORKER, self.root)
        data['worker_id'] = WORKER; data['mounts']['/etc'] = str(self.prefix / 'etc')
        marker.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError, 'Unexpected relocated storage targets'):
            module.check_storage(WORKER, self.root)


if __name__ == '__main__':
    unittest.main()
