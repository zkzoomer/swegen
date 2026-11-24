import base64
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('qc_reports', Path(__file__).parents[1] / 'scripts/stage_qc_reports.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class ReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.staging = self.root / 'staging'
        self.staging.mkdir()
        self.task = self.root / 'task'
        for lane in module.PROBES:
            self.result(lane, 'initial', f'# Original {lane}\n'.encode())

    def result(self, lane, suffix, data, status='completed', outcome='passed', artifact_path=None):
        record = {'check_id': f'swemultimodal/probe-{lane}', 'status': status,
                  'output': {'outcome': outcome, 'artifacts': []}}
        if data is not None:
            record['output']['artifacts'].append({'path': artifact_path or f'probes/{lane}.md',
                                                 'data': base64.b64encode(data).decode()})
        if status == 'error':
            record['error'] = 'Authentication expired'
        (self.staging / f'{lane}-{suffix}.json').write_text(json.dumps({'records': [record]}))

    def test_latest_failed_report_preserved_exactly(self):
        original = b'# Actual latest FAIL\n\nFinding remains unresolved.\n'
        self.result('gameability', 'final-rerun5', original, outcome='failed')
        self.result('gameability', 'auth-rerun1', b'# Earlier PASS\n')
        result = module.stage_reports(self.staging, self.task)
        self.assertEqual(result['probe_count'], 4)
        self.assertEqual((self.task / 'qc_artifacts/probes/gameability.md').read_bytes(), original)
        self.assertEqual(next(r for r in result['reports'] if r['check_id'].endswith('gameability'))['outcome'], 'failed')

    def test_urlsafe_unicode_report_preserved_exactly(self):
        original = '# Report 🛟\nActual rv report bytes.\n'.encode()
        self.result('media-ablation', 'initial', original, outcome='failed')
        file = self.staging / 'media-ablation-initial.json'
        report = json.loads(file.read_text())
        encoded = base64.urlsafe_b64encode(original).decode()
        self.assertTrue('-' in encoded or '_' in encoded)
        report['records'][0]['output']['artifacts'][0]['data'] = encoded
        file.write_text(json.dumps(report))
        module.stage_reports(self.staging, self.task)
        self.assertEqual((self.task / 'qc_artifacts/probes/media-ablation.md').read_bytes(), original)

    def test_explicit_static_records_do_not_replace_or_require_judge_markdown(self):
        check = 'swemultimodal/media-necessary'
        original = b'# Original media judge\n'
        judge = {'check_id': check, 'stage': 'judgment', 'status': 'completed',
                 'output': {'outcome': 'failed', 'artifacts': [
                     {'path': 'judges/' + check + '.md', 'data': base64.b64encode(original).decode()}]}}
        (self.staging / 'judgment-initial.json').write_text(json.dumps({'records': [judge]}))
        statics = [{'check_id': name, 'stage': stage, 'status': 'completed',
                    'output': {'outcome': 'passed', 'artifacts': []}}
                   for name, stage in [('instruction-non-empty', 'files'),
                                       ('swemultimodal/source-is-baseline', 'repo')]]
        (self.staging / 'judgment-final-rerun3.json').write_text(json.dumps({'records': statics}))
        result = module.stage_reports(self.staging, self.task)
        self.assertEqual(result['judge_count'], 1)
        self.assertEqual((self.task / 'qc_artifacts/judges/swemultimodal/media-necessary.md').read_bytes(), original)
        self.assertFalse((self.task / 'qc_artifacts/judges/instruction-non-empty.md').exists())

    def test_missing_probe_rejected_before_any_files_are_written(self):
        (self.staging / 'leakage-initial.json').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing probe results: leakage'):
            module.stage_reports(self.staging, self.task)
        self.assertFalse(self.task.exists())

    def test_new_error_replaces_earlier_pass_without_claiming_verdict(self):
        self.result('gameability', 'targeted-rerun2', None, status='error')
        module.stage_reports(self.staging, self.task)
        text = (self.task / 'qc_artifacts/probes/gameability.md').read_text()
        self.assertIn('execution error', text)
        self.assertIn('Authentication expired', text)
        self.assertNotIn('Original gameability', text)

    def test_unexpected_artifact_cannot_escape_destination(self):
        self.result('gameability', 'final-rerun5', b'escape', artifact_path='../../escape')
        with self.assertRaisesRegex(ValueError, 'Missing original Markdown'):
            module.stage_reports(self.staging, self.task)
        self.assertFalse((self.root / 'escape').exists())
        self.assertFalse(self.task.exists())

if __name__ == '__main__':
    unittest.main()
