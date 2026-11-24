import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type {Sandbox} from '@daytona/sdk'
import {runLocal} from './local-process'

export type CaptureBrowserBundle = {version: string; source: string; image: string; image_id: string; file: string; bytes: number; sha256: string}

/** Download/export once locally, before allocating any paid worker. */
export async function prepareCaptureBrowsers(project: string, log: string, kitDir: string): Promise<CaptureBrowserBundle> {
  const builder = await fs.readFile(path.join(kitDir, 'build_media_task.py'), 'utf8')
  const versions = [...builder.matchAll(/playwright==([\d.]+)/g)].map(match => match[1])
  if (!versions.length || versions.some(version => version !== '1.48.0')) throw new Error('The supplied capture kit does not match the pinned Playwright 1.48.0 browser bundle')
  console.log('Preparing pinned capture browsers locally; no worker has been created yet.')
  const result = await runLocal('python3', [path.join(project, 'scripts/capture_browser_bundle.py'), 'prepare'], project, log)
  if (result.exitCode !== 0) throw new Error(`Capture browser preparation failed before worker creation; inspect ${log}`)
  const bundle = JSON.parse(result.stdout) as CaptureBrowserBundle
  if (!path.isAbsolute(bundle.file) || !/^sha256:[a-f0-9]{64}$/.test(bundle.image_id) || !/^[a-f0-9]{64}$/.test(bundle.sha256)) throw new Error('Invalid capture browser bundle receipt')
  console.log(`Capture browser bundle ready: Playwright ${bundle.version}; ${Math.round(bundle.bytes / 1024 / 1024)} MiB.`)
  return bundle
}

export async function provisionCaptureBrowsers(sandbox: Pick<Sandbox, 'fs' | 'process'>, project: string, bundle: CaptureBrowserBundle): Promise<void> {
  const root = '/opt/swegen', archive = root + '/capture-browsers.tar.gz', receipt = root + '/capture-browser-receipt.json'
  const setup = await sandbox.process.executeCommand(`install -d -m 700 ${root}`, undefined, undefined, 30)
  if (setup.exitCode) throw new Error('Could not prepare worker browser cache directory')
  for (const name of ['capture_browser_bundle.py', 'prepare_capture.py']) {
    await sandbox.fs.uploadFile(path.join(project, 'scripts', name), '/opt/swegen-agent/' + name)
  }
  const existing = await sandbox.process.executeCommand(`sha256sum ${archive} 2>/dev/null || true`, undefined, undefined, 60)
  if (existing.exitCode === 0 && existing.result.trim().split(/\s+/)[0] === bundle.sha256) {
    console.log('Reusing matching browser archive already present on the assigned worker.')
  } else {
    console.log('Transferring verified public capture browser bundle to the worker; no browser CDN download is required there.')
    await sandbox.fs.uploadFile(bundle.file, archive)
  }
  await sandbox.fs.uploadFile(Buffer.from(JSON.stringify({...bundle, file: archive})), receipt)
  const installed = await sandbox.process.executeCommand(`python3 /opt/swegen-agent/capture_browser_bundle.py install ${receipt}`, undefined, undefined, 600)
  if (installed.exitCode) throw new Error(`Worker browser bundle verification failed: ${installed.result}`)
}
