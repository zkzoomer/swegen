import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import io
import tarfile
import hashlib
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import capture_browser_bundle as bundle
from prepare_capture import adapt, MARKER


class CaptureDockerfileTests(unittest.TestCase):
    def test_preserves_app_build_and_uses_pinned_preloaded_browsers(self):
        original = 'FROM node:24-bookworm\nRUN npm ci\nRUN pip install playwright==1.48.0 python-xlib==0.33 && playwright install --with-deps chromium firefox\n'
        changed = adapt(original)
        self.assertIn('RUN npm ci', changed)
        self.assertIn('playwright==1.48.0', changed)
        self.assertIn('playwright install-deps chromium firefox', changed)
        self.assertNotIn('playwright install --with-deps', changed)
        self.assertIn(f'COPY --from={bundle.IMAGE}', changed)
        self.assertIn('PLAYWRIGHT_BROWSERS_PATH=/ms-playwright', changed)
        self.assertEqual(adapt(changed), changed)

    def test_unknown_or_mismatched_capture_environments_are_not_silently_changed(self):
        for text in ['FROM alpine\n', 'playwright==1.99.0 && playwright install --with-deps chromium firefox',
                     'playwright==1.48.0 && playwright install chromium', MARKER]:
            with self.assertRaises(ValueError):adapt(text)


class BrowserBundleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='swegen-browser-bundle-test-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / 'bin'
        self.bin.mkdir()
        fake = self.bin / 'docker'
        fake.write_text('''#!/usr/bin/env python3
import os,sys,json
from pathlib import Path
with Path(os.environ['DOCKER_EVENTS']).open('a') as f:f.write(json.dumps(sys.argv[1:])+'\\n')
if sys.argv[1:3]==['image','inspect']:
 image_id=os.environ.get('DOCKER_IMAGE_ID','sha256:'+'a'*64)
 print(json.dumps({'Id':image_id,'Os':'linux','Architecture':'amd64','RootFS':{'Layers':['sha256:'+'c'*64]}}) if '{{json .}}' in sys.argv else image_id)
elif sys.argv[1]=='save':sys.stdout.buffer.write(b'public-pinned-browser-image-fixture')
''')
        fake.chmod(0o700)
        self.events = self.root / 'events.jsonl'
        self.environment = {'PATH':str(self.bin)+os.pathsep+os.environ['PATH'], 'DOCKER_EVENTS':str(self.events)}
        self.env_patch = patch.dict(os.environ, self.environment)
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def test_cached_bundle_is_reused_and_install_verifies_bytes_and_image_identity(self):
        receipt = bundle.prepare(self.root / 'cache')
        self.assertEqual(bundle.prepare(self.root / 'cache'), receipt)
        events = [json.loads(line) for line in self.events.read_text().splitlines()]
        self.assertEqual(sum(row[0]=='build' for row in events),1)
        self.assertEqual(sum(row[0]=='save' for row in events),1)
        file = self.root / 'receipt.json'
        file.write_text(json.dumps(receipt))
        with patch.object(bundle,'archive_identity',return_value=({'sha256:'+'a'*64},['sha256:'+'c'*64])):
            self.assertTrue(bundle.install(file)['installed'])
        self.assertTrue(json.loads((self.root/'capture-browser-ready.json').read_text())['installed'])

    def test_corrupt_archive_is_rejected_before_docker_load(self):
        receipt = bundle.prepare(self.root / 'cache')
        Path(receipt['file']).write_bytes(b'corrupt')
        file = self.root/'receipt.json'
        file.write_text(json.dumps(receipt))
        with self.assertRaisesRegex(ValueError,'corrupt'):bundle.install(file)
        self.assertNotIn('load', self.events.read_text())

    def test_wrong_loaded_image_cannot_create_readiness_receipt(self):
        receipt = bundle.prepare(self.root/'cache')
        file = self.root/'receipt.json'
        file.write_text(json.dumps(receipt))
        with patch.dict(os.environ, {'DOCKER_IMAGE_ID':'sha256:'+'b'*64}), patch.object(bundle,'archive_identity',return_value=({'sha256:'+'a'*64},['sha256:'+'c'*64])):
            with self.assertRaisesRegex(ValueError,'identity'):bundle.install(file)
        self.assertFalse((self.root/'capture-browser-ready.json').exists())

    def test_docker_config_and_containerd_manifest_ids_are_both_bound_to_the_same_config(self):
        config=json.dumps({'architecture':'amd64','os':'linux','rootfs':{'diff_ids':['sha256:'+'c'*64]}}).encode()
        config_id='sha256:'+hashlib.sha256(config).hexdigest()
        manifest=json.dumps({'config':{'digest':config_id}}).encode()
        manifest_id='sha256:'+hashlib.sha256(manifest).hexdigest()
        archive=self.root/'portable.tar.gz'
        members={'manifest.json':json.dumps([{'Config':'blobs/sha256/'+config_id[7:],'RepoTags':[bundle.IMAGE]}]).encode(),
                 'index.json':json.dumps({'manifests':[{'digest':manifest_id}]}).encode(),
                 'blobs/sha256/'+config_id[7:]:config,'blobs/sha256/'+manifest_id[7:]:manifest}
        with tarfile.open(archive,'w:gz') as tar:
            for name,data in members.items():
                info=tarfile.TarInfo(name);info.size=len(data);tar.addfile(info,io.BytesIO(data))
        identities,layers=bundle.archive_identity(archive,{'image_id':config_id})
        self.assertEqual(identities,{config_id,manifest_id})
        self.assertEqual(layers,['sha256:'+'c'*64])
        with self.assertRaisesRegex(ValueError,'config'):
            bundle.archive_identity(archive,{'image_id':'sha256:'+'d'*64})


if __name__ == '__main__':
    unittest.main()
