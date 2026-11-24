import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('handoff_auditor',ROOT/'scripts/audit_handoff.py')
auditor=importlib.util.module_from_spec(spec)
spec.loader.exec_module(auditor)

class AuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.stage=Path(self.tmp.name)
        self.task=self.stage/'task'
        self.task.mkdir()
        files={p:'fixture\n' for p in auditor.REQUIRED_TASK_PATHS}
        files.update({
            'task.toml':'[metadata]\nenvironment_id="swemultimodal"\ninstance_id="demo"\ncategory="bug_fix"\n',
            'instruction.md':'Fix the issue.\n![recording](/media/broken.mp4)\n![recording](/media/working.mp4)\n',
            'reasoning.md':'\n'.join('# '+h+'\nA concrete explanation.\n' for h in auditor.REASONING_HEADINGS),
            'environment/media/broken.mp4':'recording fixture',
            'environment/media/working.mp4':'reference fixture',
            'environment/repo/source.py':'source fixture\n',
            # Legitimate application paths must not be mistaken for author residue.
            'environment/repo/jobs/worker.py':'application queue worker\n',
            'environment/repo/tests/auth.json':'application fixture\n',
            'tests/config.json':json.dumps({'fail_to_pass':['hidden::case'],'pass_to_pass':['regression::'+str(i) for i in range(100)],'test_cmd':'fixture-test-command','log_parser':'fixture.parser','protected_paths':['test-file.py']}),
        })
        for name,text in files.items():
            p=self.task/name
            p.parent.mkdir(parents=True,exist_ok=True)
            p.write_text(text)

    def bundle(self,prefix=''):
        archive=self.stage/'renamed-export.zip'
        with ZipFile(archive,'w',compression=ZIP_DEFLATED) as z:
            for p in self.task.rglob('*'):
                if p.is_file():z.write(p,prefix+p.relative_to(self.task).as_posix())
        return archive

    def handoff(self,recovery=False):
        nested=self.bundle('official-root/')
        path=self.stage/('demo-recovery-handoff.zip' if recovery else 'demo-handoff.zip')
        with ZipFile(path,'w') as z:
            z.write(nested,'demo-work-in-progress.zip' if recovery else 'demo.zip')
            z.writestr('failure-summary.md' if recovery else 'validation-summary.md','Actual validation evidence.\n')
        return path

    def test_official_flat_and_prefixed_exports_need_no_vulnerability_proposal(self):
        for prefix in ['', 'official-root/']:
            with self.subTest(prefix=prefix):
                result=auditor.audit(self.bundle(prefix))
                self.assertEqual(result['status'],'ok')
                self.assertEqual(result['media_files'],2)
                self.assertEqual(result['pass_to_pass'],100)

    def test_two_file_multimodal_handoff(self):
        self.assertEqual(auditor.audit(self.handoff())['status'],'ok')

    def test_missing_probe_reports_fail_for_task_and_handoff(self):
        (self.task/'qc_artifacts/probes/gameability.md').unlink()
        with self.assertRaisesRegex(auditor.AuditError, 'qc_artifacts/probes/gameability.md'):
            auditor.audit(self.bundle())
        with self.assertRaisesRegex(auditor.AuditError, 'qc_artifacts/probes/gameability.md'):
            auditor.audit(self.handoff())

    def test_audits_bare_task_not_only_special_handoff_names(self):
        (self.task/'reasoning.md').unlink()
        with self.assertRaisesRegex(auditor.AuditError,'reasoning.md'):
            auditor.audit(self.bundle())

    def test_missing_empty_and_wrongly_referenced_media_fail(self):
        media=self.task/'environment/media/broken.mp4'
        media.write_bytes(b'')
        with self.assertRaisesRegex(auditor.AuditError,'nonempty'):
            auditor.audit(self.bundle())
        media.write_text('video fixture')
        prompt=self.task/'instruction.md'
        prompt.write_text(prompt.read_text()+'\n![recording](/media/missing.mp4)')
        with self.assertRaisesRegex(auditor.AuditError,'missing media'):
            auditor.audit(self.bundle())

    def test_incomplete_reasoning_and_wrong_realm_fail(self):
        (self.task/'reasoning.md').write_text('[TODO -- fill up]')
        with self.assertRaisesRegex(auditor.AuditError,'five required'):
            auditor.audit(self.bundle())
        (self.task/'reasoning.md').write_text('\n'.join('# '+h+'\nEvidence.' for h in auditor.REASONING_HEADINGS))
        (self.task/'task.toml').write_text('[metadata]\nenvironment_id="another-realm"\n')
        with self.assertRaisesRegex(auditor.AuditError,'swemultimodal'):
            auditor.audit(self.bundle())

    def test_lower_p2p_target_is_warning_not_old_realm_justification_requirement(self):
        p=self.task/'tests/config.json'
        c=json.loads(p.read_text())
        c['pass_to_pass']=c['pass_to_pass'][:20]
        p.write_text(json.dumps(c))
        result=auditor.audit(self.bundle())
        self.assertEqual(result['status'],'ok')
        self.assertTrue(any('100-case' in w for w in result['warnings']))

    def test_recovery_is_incomplete_not_passed(self):
        (self.task/'reasoning.md').unlink()
        self.assertEqual(auditor.audit(self.handoff(recovery=True))['status'],'incomplete')

    def test_timestamped_controller_recovery_stays_incomplete(self):
        (self.task/'reasoning.md').unlink()
        archive=self.handoff(recovery=True)
        timestamped=archive.with_name('demo-recovery-handoff-1795454764323.zip')
        archive.rename(timestamped)
        result=auditor.audit(timestamped)
        self.assertEqual(result['status'],'incomplete')
        self.assertEqual(result['format'],'recovery')

    def test_unsafe_paths_in_normal_and_recovery_archives_are_rejected(self):
        path=self.stage/'unsafe.zip'
        with ZipFile(path,'w') as z:z.writestr('../escape','bad')
        with self.assertRaisesRegex(auditor.AuditError,'unsafe path'):
            auditor.audit(path)
        recovery=self.handoff(recovery=True)
        with ZipFile(recovery,'a') as z:z.writestr('../escape','bad')
        with self.assertRaisesRegex(auditor.AuditError,'unsafe path'):
            auditor.audit(recovery)

    def test_raw_probe_jobs_are_rejected(self):
        p=self.task/'jobs/raw-log'
        p.parent.mkdir()
        p.write_text('generated log')
        with self.assertRaisesRegex(auditor.AuditError,'residue'):
            auditor.audit(self.bundle())

    def test_readable_git_history_is_checked_when_present(self):
        repo=self.task/'environment/repo'
        def git(*args):
            return subprocess.run(['git','-C',str(repo),*args],check=True,capture_output=True)
        git('init')
        git('add','.')
        for i in range(10):
            git('-c','user.name=Fixture','-c','user.email=fixture@example.test','-c','commit.gpgsign=false','commit','--allow-empty','-m',f'fixture {i}')
        git('update-ref','refs/heads/archive-base','HEAD')
        self.assertEqual(auditor.audit(self.bundle())['commits'],10)

if __name__=='__main__':unittest.main()
