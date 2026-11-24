/* Copyright 2025 Daytona Platforms Inc. SPDX-License-Identifier: Apache-2.0 */
import {spawn, type ChildProcess} from 'node:child_process'
import {createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {Daytona, type Sandbox} from '@daytona/sdk'
import * as dotenv from 'dotenv'
import logging from '../agent/logging.cjs'
import {parseArgs, renderJobText, usage} from './job'
import {prepareRuntimeAssets, provisionRuntimeAssets} from './runtime-assets'
import {downloadReviewLogs, preserveThenDelete} from './review-logs'
import {LocalBridge} from './bridge'
import {ComputeWorker} from './worker'
import {runLocal} from './local-process'
import {quoteShell} from './utils'
import {provisionProbeLogin, removeProbeLogin} from './probe-auth'
import {helixLaunchEnvironment} from './helix-launch'
import {prepareCaptureBrowsers, provisionCaptureBrowsers} from './capture-browsers'

dotenv.config({quiet: true})
const PROJECT = path.resolve(__dirname, '..')
const redactor = logging.createRedactor(logging.secretValues())
let closeTranscript: (() => void) | undefined
let outerProcess: ChildProcess | undefined
let runLogs: string | undefined
let failedCommands = 0

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(name + ' is not set')
  return value
}
function minutes(name: string, fallback: number): number {
  const value = Number(process.env[name] || fallback)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(name + ' must be a positive integer')
  return value
}
async function checked(command: string, args: string[], cwd: string, log?: string): Promise<string> {
  const preview = logging.commandPreview([command, ...args].join(' '))
  console.log(redactor.redact(`$ ${preview}`))
  const result = await runLocal(command, args, cwd, log)
  if (result.exitCode) {
    const diagnostic = log || (runLogs && path.join(runLogs, `command-failure-${++failedCommands}.txt`))
    if (diagnostic && !log) await fs.writeFile(diagnostic, redactor.redact(result.stdout + result.stderr), {mode: 0o600})
    throw new Error(`${preview} exited with status ${result.exitCode}` + (diagnostic ? `; details: ${diagnostic}` : ''))
  }
  return result.stdout
}
export async function taskDirectoryFromDownload(output: string): Promise<string> {
  const parsed = JSON.parse(output)
  const candidates = new Set<string>()
  async function visit(value: unknown): Promise<void> {
    if (typeof value === 'string' && path.isAbsolute(value)) {
      try {if ((await fs.stat(path.join(value, 'task.toml'))).isFile()) candidates.add(await fs.realpath(value))} catch {}
    } else if (value && typeof value === 'object') {
      for (const child of Object.values(value)) await visit(child)
    }
  }
  await visit(parsed)
  if (candidates.size !== 1) throw new Error('Could not identify one downloaded task folder. Use --task-dir with the folder printed by helix task download.')
  return [...candidates][0]
}
async function localPreflight(logs: string): Promise<void> {
  await checked('python3', ['--version'], PROJECT)
  await checked('uv', ['--version'], PROJECT)
  await checked('helix', ['doctor', '--output', 'json'], PROJECT, path.join(logs, 'helix-doctor.txt'))
  console.log('$ codex login status')
  const codex = await runLocal('codex', ['login', 'status'], PROJECT, path.join(logs, 'codex-status.txt'), {...process.env, OPENAI_API_KEY: undefined, CODEX_API_KEY: undefined})
  if (codex.exitCode) throw new Error('Local Codex login is missing; run codex login before launching')
  await checked('docker', ['info', '--format', '{{.ServerVersion}}'], PROJECT, path.join(logs, 'local-docker.txt'))
  console.log('Local Helix, Codex, uv, Python and Docker preflight passed.')
}
async function loadRvKey(): Promise<string> {
  if (process.env.OPENROUTER_API_KEY?.trim()) return process.env.OPENROUTER_API_KEY.trim()
  const file = process.env.RV_AUTH_PATH || path.join(os.homedir(), '.rv/auth.json')
  const data = JSON.parse(await fs.readFile(file, 'utf8'))
  if (typeof data.openrouter_api_key !== 'string' || data.openrouter_api_key.length < 20) throw new Error('No usable rv OpenRouter credential')
  return data.openrouter_api_key
}
async function workerCommand(sandbox: Sandbox, command: string, timeout = 60): Promise<string> {
  const preview = logging.commandPreview(command)
  console.log(redactor.redact(`[worker] $ ${preview}`))
  const result = await sandbox.process.executeCommand(command, '/home/daytona/workspace', undefined, timeout)
  if (result.exitCode) {
    const diagnostic = runLogs && path.join(runLogs, `command-failure-${++failedCommands}.txt`)
    if (diagnostic) await fs.writeFile(diagnostic, redactor.redact(result.result), {mode: 0o600})
    throw new Error(`Compute worker setup failed (exit ${result.exitCode}): ${preview}` + (diagnostic ? `; details: ${diagnostic}` : ''))
  }
  return result.result
}
async function prepareWorker(sandbox: Sandbox, rvKey?: string): Promise<void> {
  // A recovered worker may use bind-mounted storage. Check it from / before
  // uploads or mkdir can silently recreate state under an unmounted home.
  const storageGuard = await fs.readFile(path.join(PROJECT, 'scripts/check_worker_storage.py'), 'utf8')
  const storage = await sandbox.process.executeCommand('python3 -B -c ' + quoteShell(storageGuard) + ' ' + quoteShell(sandbox.id), '/', undefined, 30)
  if (storage.exitCode !== 0) throw new Error('Worker storage guard failed before bootstrap: ' + redactor.redact(storage.result))
  console.log('[worker storage] ' + storage.result.trim())
  for (const name of ['task_snapshot.py', 'collect_review_logs.py', 'qc_batch.py', 'probe_preflight.py']) await sandbox.fs.uploadFile(path.join(PROJECT, 'scripts', name), '/opt/swegen-agent/' + name)
  await workerCommand(sandbox, 'install -d -m 700 /home/daytona/author-staging /home/daytona/capture-staging /output')
  console.log("[worker] $ docker info --format '{{.ServerVersion}}'")
  let dockerReady = false
  for (let i = 0; i < 30; i++) {
    const result = await sandbox.process.executeCommand("docker info --format '{{.ServerVersion}}'", undefined, undefined, 10)
    if (result.exitCode === 0) {dockerReady = true; break}
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
  if (!dockerReady) throw new Error('Compute worker Docker daemon did not become ready')
  if (rvKey) {
    await workerCommand(sandbox, 'install -d -m 700 /root/.rv')
    await sandbox.fs.uploadFile(Buffer.from(JSON.stringify({openrouter_api_key: rvKey, daytona_api_key: null})), '/root/.rv/auth.json')
    await workerCommand(sandbox, 'chmod 600 /root/.rv/auth.json')
    await workerCommand(sandbox, 'rv mode openrouter')
    await workerCommand(sandbox, "python3 -c 'import json,urllib.request; p=json.load(open(\"/root/.rv/auth.json\")); r=urllib.request.urlopen(urllib.request.Request(\"https://openrouter.ai/api/v1/key\", headers={\"Authorization\": \"Bearer \"+p[\"openrouter_api_key\"]}), timeout=20); assert r.status==200'", 30)
  }
}
function stopOuter(): void {
  if (outerProcess?.pid) {
    try {process.kill(-outerProcess.pid, 'SIGTERM')} catch {outerProcess.kill('SIGTERM')}
  }
}
async function runOuter(workspace: string, logs: string, context: string): Promise<void> {
  const prompt = 'Read JOB.md, AGENTS.md and the runtime context. Use $swe-multimodal-task-author ' +
    'to complete the assigned task as the local outer agent. Follow the supplied writing roles, ' +
    'recorded inner workflow, compute bridge, QC limits and final local oracle requirements.'
  await new Promise<void>((resolve, reject) => {
    outerProcess = spawn(path.join(PROJECT, 'agent/node_modules/.bin/tsx'), [path.join(PROJECT, 'agent/index.ts')], {
      cwd: workspace, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, PROMPT: prompt, SWEGEN_OUTER_WORKSPACE: workspace,
        SWEGEN_CONTEXT_PATH: context, SWEGEN_REVIEW_LOG_DIR: path.join(logs, 'outer'),
        OPENAI_API_KEY: undefined, CODEX_API_KEY: undefined},
    })
    outerProcess.stdout!.on('data', (data: Buffer) => process.stdout.write(data))
    outerProcess.stderr!.on('data', (data: Buffer) => process.stderr.write(data))
    outerProcess.on('error', reject)
    outerProcess.on('close', code => code === 0 ? resolve() : reject(new Error(`Local outer agent exited with status ${code}`)))
  })
}
// Helix owns the recorded trace. Keep references to matching journals rather than
// copying and concatenating full sessions into an unrelated console transcript.
async function recordLocalJournals(logs: string, task: string, started: number): Promise<void> {
  if (!task) return
  const journals = path.join(os.homedir(), '.micro1-helix/journal/author')
  let entries: string[] = []
  try {entries = await fs.readdir(journals)} catch {return}
  const matches: string[] = []
  for (const name of entries) {
    const directory = path.join(journals, name)
    try {
      const metadata = path.join(directory, 'session.json')
      if ((await fs.stat(metadata)).mtimeMs >= started && (await fs.readFile(metadata, 'utf8')).includes(task)) matches.push(directory)
    } catch {}
  }
  await fs.writeFile(path.join(logs, 'helix-journals.json'), JSON.stringify({journals: matches}, null, 2) + '\n', {mode: 0o600})
}
async function packageTask(task: string, output: string, staging: string, incomplete: boolean, reviewRequired = false): Promise<string> {
  const official = path.join(staging, `task-${Date.now()}.zip`)
  await checked('helix', ['task', 'zip', '--destination', official], task)
  const summary = path.join(staging, incomplete ? 'failure-summary.md' : 'validation-summary.md')
  await fs.access(summary)
  const name = path.basename(task).replace(/[^A-Za-z0-9._-]/g, '-')
  const destination = path.join(output, `${name}-${incomplete ? 'recovery-' : reviewRequired ? 'review-' : ''}handoff-${Date.now()}.zip`)
  const script = `import sys,zipfile\np,s,o,n,incomplete=sys.argv[1:]\nwith zipfile.ZipFile(o,'x',zipfile.ZIP_DEFLATED) as z:\n z.write(p,n+('-work-in-progress.zip' if incomplete=='yes' else '.zip'))\n z.write(s,'failure-summary.md' if incomplete=='yes' else 'validation-summary.md')\n`
  await checked('python3', ['-c', script, official, summary, destination, name, incomplete ? 'yes' : 'no'], PROJECT)
  if (!incomplete) {
    try {await checked('python3', [path.join(PROJECT, 'scripts/audit_handoff.py'), destination], PROJECT)}
    catch (error) {await fs.rename(destination, destination.replace(/\.zip$/, '-audit-failed.zip')); throw error}
  }
  const hash = createHash('sha256'); for await (const chunk of createReadStream(destination)) hash.update(chunk)
  console.log(`Local handoff: ${destination}\nSHA-256: ${hash.digest('hex')}`)
  return destination
}
async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {console.log(usage()); return}
  const options = parseArgs(process.argv.slice(2), process.env.LOCAL_OUTPUT_DIR || './outputs')
  const rvMode = process.env.SWEGEN_RV_MODE ?? 'openrouter'
  if (rvMode !== 'openrouter' && rvMode !== 'codex') throw new Error('SWEGEN_RV_MODE must be openrouter or codex')
  await fs.mkdir(path.join(options.outputDir, 'logs'), {recursive: true, mode: 0o700})
  const logs = await fs.mkdtemp(path.join(options.outputDir, 'logs', 'run-'))
  runLogs = logs
  closeTranscript = logging.installTranscript(path.join(logs, 'controller.txt'), redactor)
  process.once('exit', () => closeTranscript?.())
  console.log(`Local text log: ${path.join(logs, 'controller.txt')}`)
  Object.assign(process.env, await helixLaunchEnvironment(path.join(logs, 'helix-bin'), path.join(PROJECT, 'scripts/helix_gate.py')))
  if (options.authSmoke) {
    await checked('codex', ['login', 'status'], PROJECT)
    const response = await checked('codex', ['exec', '--ephemeral', '--skip-git-repo-check', '--model', required('CODEX_MODEL'), '--sandbox', 'read-only', '--color', 'never', 'Reply only with OK'], PROJECT)
    if (!/(^|\n)OK(\n|$)/.test(response)) throw new Error('Local authentication smoke did not produce OK')
    return
  }
  const job = renderJobText(await fs.readFile(path.join(PROJECT, 'JOB.template.md'), 'utf8'), options, await fs.readFile(options.briefFile, 'utf8'))
  await fs.writeFile(path.join(logs, 'JOB.md'), redactor.redact(job), {mode: 0o600})
  const runtime = await prepareRuntimeAssets(PROJECT, process.env.MEDIA_CAPTURE_KIT_DIR)
  if (!runtime) throw new Error('MEDIA_CAPTURE_KIT_DIR is required')
  let task = options.taskDir
  if (!options.dryRun) {
    await localPreflight(logs)
    if (!task) task = await taskDirectoryFromDownload(await checked('helix', ['task', 'download', options.taskUrl, '--output', 'json'], PROJECT))
    task = await fs.realpath(task)
    await fs.access(path.join(task, 'task.toml'))
    const status = await checked('helix', ['task', 'status', '--output', 'json'], task)
    const expectedId = new URL(options.taskUrl).searchParams.get('task_id')
    if (!expectedId || !JSON.stringify(JSON.parse(status)).includes(expectedId)) throw new Error('Local linked task does not match --task-url')
  }
  // Do not bill a sandbox if its required browsers cannot be supplied. Dry-run
  // remains a transport-only check and does not build or transfer browser images.
  const browserBundle = options.dryRun ? undefined : await prepareCaptureBrowsers(PROJECT, path.join(logs, 'capture-browser-prepare.txt'), required('MEDIA_CAPTURE_KIT_DIR'))
  const staging = path.join(logs, 'author-staging'), workspace = path.join(logs, 'outer-workspace')
  await fs.mkdir(staging, {mode: 0o700}); await fs.mkdir(workspace, {mode: 0o700})
  const rvKey = options.dryRun || rvMode === 'codex' ? undefined : await loadRvKey()
  if (rvKey) redactor.add(rvKey)
  const daytona = new Daytona({apiKey: required('DAYTONA_API_KEY')})
  const ttl = minutes('DAYTONA_SANDBOX_MAX_LIFETIME_MINUTES', 240), retention = minutes('DAYTONA_SANDBOX_RECOVERY_RETENTION_MINUTES', 120)
  let bridge: LocalBridge | undefined, socketDirectory: string | undefined, deleted = false, reviewRequired = false
  let interrupted = false
  const signal = () => {
    interrupted = true; stopOuter(); bridge?.terminal.interrupt()
    console.error('Stopping the local job; waiting for active setup/Helix cleanup and preserving evidence.')
  }
  process.once('SIGINT', signal); process.once('SIGTERM', signal)
  console.log('Creating one persistent Daytona compute worker; both agents stay local...')
  let sandbox: Sandbox
  try {
    if (process.env.SWEGEN_REUSE_WORKER_ID) {
      sandbox = await daytona.get(process.env.SWEGEN_REUSE_WORKER_ID)
      if (sandbox.state !== 'started') await sandbox.start(600)
      await sandbox.setTtl(ttl)
      await sandbox.setAutoDeleteInterval(retention)
      console.log(`Reusing existing assigned compute worker: ${sandbox.id}`)
    } else sandbox = await daytona.create({name: `swegen-compute-${Date.now()}`, snapshot: required('DAYTONA_SNAPSHOT'), public: false,
      autoStopInterval: 0, autoDeleteInterval: retention, ttlMinutes: ttl,
      envVars: {MEDIA_CAPTURE_KIT_DIR: runtime.kitDir}}, {timeout: 600})
  } catch (error) {
    process.removeListener('SIGINT', signal); process.removeListener('SIGTERM', signal); throw error
  }
  console.log(`Compute worker: ${sandbox.id}`)
  const deadline = setTimeout(signal, ttl * 60_000)
  const started = Date.now()
  try {
    if (interrupted) throw new Error('Interrupted during worker creation')
    await prepareWorker(sandbox, rvKey)
    if (browserBundle) await provisionCaptureBrowsers(sandbox, PROJECT, browserBundle)
    if (!options.dryRun) {
      await provisionProbeLogin(sandbox)
      await workerCommand(sandbox, 'python3 /opt/swegen-agent/probe_preflight.py ' + quoteShell(required('CODEX_MODEL')), 110)
      // Official Codex mode may inspect its login, so select it only after the
      // same subscription check required for OpenRouter-mode probes succeeds.
      if (rvMode === 'codex') await workerCommand(sandbox, 'rv mode codex')
      console.log('Live Codex probe authentication passed; Helix authoring remains local.')
    }
    await provisionRuntimeAssets(sandbox, runtime)
    if (interrupted) throw new Error('Interrupted before either agent started')
    if (options.dryRun) {
      await workerCommand(sandbox, "printf 'swegen-compute-transfer-smoke\\n' > /output/smoke.txt")
      const content = await sandbox.fs.downloadFile('/output/smoke.txt')
      if (content.toString() !== 'swegen-compute-transfer-smoke\n') throw new Error('Compute transfer smoke failed')
      console.log('Compute provisioning/transfer smoke passed; no agents started.')
    } else {
      const worker = new ComputeWorker(sandbox, PROJECT, staging, logs, redactor.redact)
      bridge = new LocalBridge(PROJECT, task, staging, logs, worker, redactor.redact)
      socketDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'swegen-bridge-'))
      const socket = path.join(socketDirectory, 'control.sock')
      const context = path.join(logs, 'context.json')
      process.env.SWEGEN_CONTEXT_PATH = context
      await bridge.listen(socket)
      await fs.writeFile(context, JSON.stringify({socket, taskDir: task, staging, logs, workerId: sandbox.id,
        project: PROJECT, kitDir: runtime.kitDir, captureBrowserImage: browserBundle?.image,
        capturePrepare: '/opt/swegen-agent/prepare_capture.py', remoteStaging: '/home/daytona/author-staging', helper: path.join(PROJECT, 'dist/bridge-client.js')}, null, 2), {mode: 0o600})
      await fs.writeFile(path.join(workspace, 'JOB.md'), job + `\n\nLocal runtime context: ${context}\nRead it before acting.`, {mode: 0o600})
      await fs.copyFile(path.join(PROJECT, 'AGENTS.md'), path.join(workspace, 'AGENTS.md'))
      await fs.mkdir(path.join(workspace, '.agents/skills'), {recursive: true})
      await fs.symlink(path.join(PROJECT, 'skills/swe-multimodal-task-author'), path.join(workspace, '.agents/skills/swe-multimodal-task-author'))
      await runOuter(workspace, logs, context)
      if (interrupted) throw new Error('Interrupted')
      const quality = await bridge.assertReady()
      reviewRequired = quality.status === 'review_required'
      await packageTask(task, options.outputDir, staging, false, reviewRequired)
    }
    await recordLocalJournals(logs, task, started)
    await preserveThenDelete(() => downloadReviewLogs(sandbox, logs), async () => {await sandbox.delete(); deleted = true})
    console.log(options.dryRun ? 'Compute smoke finished; no task agents or QC ran. Compute worker deleted.' : reviewRequired
      ? 'Review handoff packaged with disputed QC findings; no clean QC pass is claimed. Evidence is local. Compute worker deleted.'
      : 'Handoff packaged; task, traces and review evidence are local. QC passed. Compute worker deleted.')
  } catch (error) {
    console.error(`Job incomplete: ${redactor.redact(String(error))}`)
    await bridge?.close().catch(() => undefined)
    await recordLocalJournals(logs, task, started).catch(() => undefined)
    if (task) {
      const validation = await fs.readFile(path.join(staging, 'validation-summary.md'), 'utf8').catch(() => '')
      await fs.writeFile(path.join(staging, 'failure-summary.md'), `# Incomplete\n\n${redactor.redact(String(error))}\n\nLocal task: ${task}\nLogs: ${logs}\nWorker: ${sandbox.id}\nNo submission-ready claim. See local validation-summary.md and qc-completion.json when present.\n${validation ? '\n' + validation : ''}`, {mode: 0o600})
      await packageTask(task, options.outputDir, staging, true).catch(e => console.error(`Recovery ZIP unavailable; original local task is preserved: ${String(e)}`))
    }
    await downloadReviewLogs(sandbox, logs).catch(e => console.error(`Review transfer incomplete: ${String(e)}`))
    await removeProbeLogin(sandbox).catch(() => console.error('Probe login cleanup failed; recovery worker remains private.'))
    await sandbox.setTtl(retention).catch(() => undefined)
    await sandbox.setAutoDeleteInterval(retention).catch(() => undefined)
    await sandbox.stop(60).catch(e => console.error(`Could not stop compute worker: ${String(e)}`))
    console.error(`Recovery worker ${sandbox.id}; retained for ${retention} minutes. Local work remains at ${task || logs}.`)
    throw error
  } finally {
    clearTimeout(deadline)
    process.removeListener('SIGINT', signal); process.removeListener('SIGTERM', signal)
    await bridge?.close()
    if (socketDirectory) await fs.rm(socketDirectory, {recursive: true, force: true})
    if (!deleted) console.error(`Recovery worker ID: ${sandbox.id}`)
  }
}
if (require.main === module) main().catch(error => {console.error(redactor.redact(String(error))); process.exitCode = 1}).finally(() => closeTranscript?.())
