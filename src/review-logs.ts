import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// Small transport contract makes the deletion gate testable without a Daytona worker.
type LogTransport = {
  process: {executeCommand(command: string, cwd: string, env: undefined, timeout: number): Promise<{exitCode?: number; result: string}>}
  fs: {downloadFile(remote: string, local: string, timeout: number): Promise<unknown>}
}

export async function downloadReviewLogs(sandbox: LogTransport, directory: string): Promise<string> {
  const remote = `/tmp/swegen-review-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`
  console.log(`[worker] $ python3 /opt/swegen-agent/collect_review_logs.py ${remote}`)
  const result = await sandbox.process.executeCommand(
    `python3 /opt/swegen-agent/collect_review_logs.py '${remote}'`, '/home/daytona/workspace', undefined, 120,
  )
  if (result.exitCode !== 0) throw new Error(`review log collection failed: ${result.result}`)
  const metadata = JSON.parse(result.result.trim()) as {path: string; size: number; sha256: string; files: number; errors: unknown[]}
  if (metadata.path !== remote || !Number.isSafeInteger(metadata.size) || metadata.size <= 0 ||
      !/^[a-f0-9]{64}$/.test(metadata.sha256) || !Array.isArray(metadata.errors)) {
    throw new Error('invalid review log manifest')
  }
  // Store even an incomplete collection before reporting the problem.
  await fs.mkdir(directory, {recursive: true, mode: 0o700})
  const local = path.join(directory, path.basename(remote).replace('swegen-review-', 'worker-review-'))
  await fs.writeFile(local, '', {flag: 'wx', mode: 0o600})
  await sandbox.fs.downloadFile(remote, local, 0)
  await fs.chmod(local, 0o600)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(local)) hash.update(chunk)
  if ((await fs.stat(local)).size !== metadata.size || hash.digest('hex') !== metadata.sha256) {
    throw new Error(`review log download failed integrity verification: ${local}`)
  }
  console.log(`Verified private review logs: ${local} (${metadata.files} files)`)
  if (metadata.errors.length) throw new Error(`Some review logs could not be read; partial evidence saved at ${local}: ${JSON.stringify(metadata.errors)}`)
  return local
}

export async function preserveThenDelete(saveLogs: () => Promise<unknown>, removeWorker: () => Promise<unknown>): Promise<void> {
  await saveLogs()
  await removeWorker()
}
