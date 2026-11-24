import importlib.util
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('snapshot',Path(__file__).parents[1]/'scripts/task_snapshot.py')
snapshot=importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class SnapshotTest(unittest.TestCase):
    def test_full_delta_reuse_and_deletions_preserve_production_jobs(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); source=root/'source'; source.mkdir()
            for name,text in {'task.toml':'task','environment/repo/src/jobs/handler.ts':'production jobs','environment/repo/old.ts':'old','jobs/log.txt':'generated','environment/repo/node_modules/cache':'dependency','.env':'private'}.items():
                p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
            first=snapshot.pack(source,root/'first.tgz',root/'first.json')
            self.assertIn('environment/repo/src/jobs/handler.ts',first['files'])
            self.assertNotIn('jobs/log.txt',first['files']);self.assertNotIn('.env',first['files'])
            destination=snapshot.apply(root/'worker',root/'first.tgz',root/'first.json')
            (source/'environment/repo/old.ts').unlink()
            (source/'environment/repo/src/jobs/handler.ts').write_text('updated')
            second=snapshot.pack(source,root/'second.tgz',root/'second.json',root/'first.json')
            self.assertEqual(second['changed'],['environment/repo/src/jobs/handler.ts'])
            self.assertEqual(second['removed'],['environment/repo/old.ts'])
            updated=snapshot.apply(root/'worker',root/'second.tgz',root/'second.json')
            self.assertEqual((updated/'environment/repo/src/jobs/handler.ts').read_text(),'updated')
            self.assertFalse((updated/'environment/repo/old.ts').exists())
            self.assertEqual((destination/'environment/repo/src/jobs/handler.ts').read_text(),'production jobs')
            self.assertEqual(snapshot.apply(root/'worker',root/'second.tgz',root/'second.json'),updated)
            (updated/'task.toml').write_text('corrupt')
            with self.assertRaisesRegex(ValueError,'verification failed'):snapshot.apply(root/'worker',root/'second.tgz',root/'second.json')

    def test_deleted_directories_do_not_reappear_in_deltas_or_cached_snapshots(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'source';source.mkdir()
            for name in ['task.toml','environment/repo/.vscode/settings.json',
                         'environment/repo/.git/refs/heads/task-base']:
                p=source/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('content')
            snapshot.pack(source,root/'first.tgz',root/'first.json')
            first=snapshot.apply(root/'worker',root/'first.tgz',root/'first.json')
            (source/'environment/repo/.vscode/settings.json').unlink()
            snapshot.pack(source,root/'second.tgz',root/'second.json',root/'first.json')
            second=snapshot.apply(root/'worker',root/'second.tgz',root/'second.json')
            self.assertFalse((second/'environment/repo/.vscode').exists())
            self.assertTrue((second/'environment/repo/.git/refs/heads/task-base').is_file())
            self.assertTrue((first/'environment/repo/.vscode/settings.json').is_file())
            # Normalize a cache created by the previous file-only implementation.
            (second/'environment/repo/.vscode').mkdir()
            reused=snapshot.apply(root/'worker',root/'second.tgz',root/'second.json')
            self.assertEqual(reused,second)
            self.assertFalse((second/'environment/repo/.vscode').exists())

    def test_symlink_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'source';source.mkdir();(root/'secret').write_text('private')
            (source/'escape').symlink_to(root/'secret')
            with self.assertRaisesRegex(ValueError,'regular file'):snapshot.pack(source,root/'a.tgz',root/'a.json')

    def test_archive_traversal_and_nonregular_members_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);files={'safe':{'sha256':'0'*64,'mode':0o644}}
            manifest={'id':snapshot.identity(files),'base':None,'files':files,'changed':['safe'],'removed':[]}
            (root/'manifest').write_text(json.dumps(manifest))
            with tarfile.open(root/'bad.tgz','w:gz') as archive:
                member=tarfile.TarInfo('../escape');archive.addfile(member)
            with self.assertRaisesRegex(ValueError,'unsafe'):snapshot.apply(root/'worker',root/'bad.tgz',root/'manifest')
            self.assertFalse((root/'escape').exists())

    def test_snapshot_content_identity_does_not_change_with_timestamps(self):
        import os
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/'source';source.mkdir();(source/'task.toml').write_text('task')
            a=snapshot.pack(source,root/'a.tgz',root/'a.json');os.utime(source/'task.toml',(1,1))
            b=snapshot.pack(source,root/'b.tgz',root/'b.json')
            self.assertEqual(a['id'],b['id']);self.assertEqual((root/'a.tgz').read_bytes(),(root/'b.tgz').read_bytes())
