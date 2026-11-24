import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location('collector', Path(__file__).parents[1] / 'scripts/collect_review_logs.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class ReviewLogsTest(unittest.TestCase):
    def test_collect_diagnostics_once_without_agent_transcripts_credentials_or_tooling(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            home = root / 'home'
            workspace = root / 'workspace'
            staging = root / 'author-staging'
            tasks = root / 'helix-tasks'
            worker = root / 'author-logs'
            files = {
                home / '.rv/auth.json': '{"openrouter_api_key":"private-fixture-key"}',
                home / '.codex/auth.json': '{"tokens":{"access_token":"private-codex-token"}}',
                home / '.codex/sessions/date/rollout-inner.jsonl': '{"output":"inner session private-codex-token"}\n',
                home / '.micro1-helix/journal/author/id/events.jsonl': '{"output":"helix trace"}\n',
                home / '.micro1-helix/journal/author/id/session.json': '{"private":"do not package arbitrary session metadata"}',
                worker / 'outer-events.jsonl': '{"output":"private-fixture-key"}\n',
                worker / 'outer.txt': 'actual command output\n',
                workspace / 'JOB.md': 'task assignment',
                staging / 'qc/jobs/trial/agent.log': 'probe agent log',
                staging / 'worker-jobs/id/stdout.log': 'actual command output private-fixture-key\n',
                staging / 'worker-jobs/id/stderr.log': 'failure diagnostic private-codex-token\n',
                staging / 'qc/run/qc_artifacts/probes/gameability.md': 'Finding: incomplete selection restoration',
                tasks / 'pipeline/tasks/task/environment/Dockerfile': 'not a review log',
                staging / 'media-capture-kit/capturekit/__init__.py': 'proprietary tool code',
            }
            for file, text in files.items():
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(text)
            # No symlink escape into the kit or credential stores.
            (staging / 'stdout.log').symlink_to(home / '.rv/auth.json')
            destination = root / 'review.zip'
            metadata = collector.collect(destination, [home], staging)
            self.assertEqual(metadata['errors'], [])
            self.assertFalse(destination.with_suffix('.txt').exists())
            self.assertEqual(metadata['sha256'], hashlib.sha256(destination.read_bytes()).hexdigest())
            self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
            with ZipFile(destination) as archive:
                names = archive.namelist()
                self.assertFalse(any('rollout-inner.jsonl' in name for name in names))
                self.assertFalse(any('events.jsonl' in name for name in names))
                self.assertTrue(any('gameability.md' in name for name in names))
                self.assertFalse(any('agent.log' in name for name in names))
                self.assertTrue(any('stdout.log' in name for name in names))
                self.assertFalse(any('auth.json' in name or 'session.json' in name or '__init__' in name or 'leak.jsonl' in name for name in names))
                content = '\n'.join(archive.read(name).decode() for name in names)
                self.assertNotIn('private-fixture-key', content)
                self.assertNotIn('private-codex-token', content)
                self.assertIn('actual command output', content)
                self.assertIn('[REDACTED]', content)

    def test_empty_run_is_explicit_and_existing_archive_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            destination = root / 'review.zip'
            metadata = collector.collect(destination, [root/'home'], root/'staging')
            self.assertEqual(metadata['files'], 0)
            with ZipFile(destination) as archive:
                manifest = json.loads(archive.read('manifest.json'))
                self.assertTrue(all(not source['present'] for source in manifest['sources']))
            with self.assertRaises(FileExistsError):
                collector.collect(destination, [], root/'staging')
