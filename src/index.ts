/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { Daytona, Sandbox } from '@daytona/sdk'
import * as dotenv from 'dotenv'
import { renderMarkdown, quoteShell } from './utils'
import { parseArgs, renderJobText, usage, type CliOptions } from './job'
import { validateArchiveEntries } from './artifacts'
import {
  prepareRuntimeAssets,
  provisionRuntimeAssets,
} from './runtime-assets'

dotenv.config()

const PROJECT_ROOT = path.resolve(__dirname, '..')
const REMOTE_WORKSPACE = '/home/daytona/workspace'
const REMOTE_OUTPUT = '/output'
const REMOTE_FAILURE_LOG = `${REMOTE_WORKSPACE}/codex-worker-failures.jsonl`
const REMOTE_ARCHIVE_AUDITOR = '/opt/swegen-agent/audit_handoff.py'
const SANDBOX_MAX_LIFETIME_MINUTES = readPositiveIntegerEnv(
  'DAYTONA_SANDBOX_MAX_LIFETIME_MINUTES',
  240,
)
const SANDBOX_RECOVERY_RETENTION_MINUTES = readPositiveIntegerEnv(
  'DAYTONA_SANDBOX_RECOVERY_RETENTION_MINUTES',
  120,
)

type RemoteArtifact = {
  name: string
  path: string
  size: number
  sha256: string
  auditStatus: 'passed' | 'incomplete' | 'failed' | 'skipped'
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set`)
  return value
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim()
  if (!raw) return fallback

  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer number of minutes`)
  }
  return value
}

async function renderJob(options: CliOptions): Promise<string> {
  if (options.authSmoke) return ''
  const [template, brief] = await Promise.all([
    fs.readFile(path.join(PROJECT_ROOT, 'JOB.template.md'), 'utf8'),
    fs.readFile(options.briefFile, 'utf8'),
  ])
  return renderJobText(template, options, brief)
}

type RvAuthFile = {
  openrouter_api_key?: unknown
}

async function loadOpenRouterApiKey(): Promise<string> {
  const fromEnvironment = process.env.OPENROUTER_API_KEY?.trim()
  if (fromEnvironment) return fromEnvironment

  const configuredPath = process.env.RV_AUTH_PATH?.trim()
  const authPath = configuredPath
    ? path.resolve(configuredPath)
    : path.join(os.homedir(), '.rv', 'auth.json')

  let parsed: RvAuthFile
  try {
    parsed = JSON.parse(await fs.readFile(authPath, 'utf8')) as RvAuthFile
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`cannot read the local rv OpenRouter credential at ${authPath}: ${message}`)
  }

  if (typeof parsed.openrouter_api_key !== 'string' || parsed.openrouter_api_key.trim().length < 20) {
    throw new Error(`local rv auth file has no usable openrouter_api_key: ${authPath}`)
  }
  return parsed.openrouter_api_key.trim()
}

function environmentPrefix(variables: Record<string, string>): string {
  const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64')
  return Object.entries(variables)
    .map(([name, value]) => `${name}="$(printf '%s' '${encode(value)}' | base64 --decode)"`)
    .join(' ')
}

async function waitForDocker(sandbox: Sandbox): Promise<void> {
  let lastResult = ''
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const result = await sandbox.process.executeCommand(
      "docker info --format '{{.ServerVersion}}'",
      REMOTE_WORKSPACE,
      undefined,
      10,
    )
    if (result.exitCode === 0) {
      console.log(`Docker daemon ready: ${result.result.trim()}`)
      return
    }
    lastResult = result.result.trim()
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  throw new Error(`Docker daemon did not become ready${lastResult ? `: ${lastResult}` : ''}`)
}

async function uploadJobFiles(sandbox: Sandbox, job: string): Promise<void> {
  await sandbox.fs.uploadFile(path.join(PROJECT_ROOT, 'AGENTS.md'), `${REMOTE_WORKSPACE}/AGENTS.md`)
  await sandbox.fs.uploadFile(Buffer.from(job, 'utf8'), `${REMOTE_WORKSPACE}/JOB.md`)
  // Keep the lightweight launcher current without rebuilding the heavyweight
  // toolchain snapshot. Its pinned dependencies remain in /opt/swegen-agent.
  await sandbox.fs.uploadFile(
    path.join(PROJECT_ROOT, 'agent', 'index.ts'),
    '/opt/swegen-agent/index.ts',
  )
  await sandbox.fs.uploadFile(
    path.join(PROJECT_ROOT, 'scripts', 'audit_handoff.py'),
    REMOTE_ARCHIVE_AUDITOR,
  )
}

async function configureRvAuthentication(sandbox: Sandbox, openRouterApiKey: string): Promise<void> {
  await executeChecked(sandbox, 'install -d -m 700 /root/.rv')
  const remoteAuth = JSON.stringify({ openrouter_api_key: openRouterApiKey, daytona_api_key: null })
  await sandbox.fs.uploadFile(Buffer.from(`${remoteAuth}\n`, 'utf8'), '/root/.rv/auth.json')
  await executeChecked(sandbox, 'chmod 600 /root/.rv/auth.json')
  await executeChecked(
    sandbox,
    "python3 -c 'import json; p=json.load(open(\"/root/.rv/auth.json\")); assert isinstance(p.get(\"openrouter_api_key\"), str) and len(p[\"openrouter_api_key\"]) >= 20'",
  )
  await executeChecked(
    sandbox,
    "python3 -c 'import json,urllib.request; p=json.load(open(\"/root/.rv/auth.json\")); r=urllib.request.urlopen(urllib.request.Request(\"https://openrouter.ai/api/v1/key\", headers={\"Authorization\": \"Bearer \" + p[\"openrouter_api_key\"]}), timeout=20); assert r.status == 200'",
    30,
  )
  console.log('Realm Verifier OpenRouter authentication installed from the local rv credential.')
}

async function runCodexWorker(sandbox: Sandbox, prompt: string): Promise<void> {
  const sessionId = `swegen-${Date.now()}`

  await sandbox.process.createSession(sessionId)
  try {
    const command = await sandbox.process.executeSessionCommand(
      sessionId,
      {
        command: `${environmentPrefix({ PROMPT: prompt })} env -u OPENAI_API_KEY -u CODEX_API_KEY /opt/swegen-agent/node_modules/.bin/tsx /opt/swegen-agent/index.ts`,
        runAsync: true,
        suppressInputEcho: true,
      },
      0,
    )
    if (!command.cmdId) throw new Error('Daytona did not return a Codex command ID')

    await sandbox.process.getSessionCommandLogs(
      sessionId,
      command.cmdId,
      (chunk: string) => {
        const rendered = renderMarkdown(chunk.trimEnd())
        if (rendered) process.stdout.write(`${rendered}\n`)
      },
      (chunk: string) => {
        if (chunk) process.stderr.write(chunk)
      },
    )

    const completed = await sandbox.process.getSessionCommand(sessionId, command.cmdId)
    if (completed.exitCode !== 0) {
      throw new Error(`Codex worker exited with status ${String(completed.exitCode)}`)
    }
  } finally {
    await sandbox.process.deleteSession(sessionId).catch(() => undefined)
  }
}

function initialWorkerPrompt(): string {
  return [
    `Read ${REMOTE_WORKSPACE}/JOB.md and use $swe-multimodal-task-author.`,
    `Follow the injected AGENTS.md and the supplied task assignment.`,
    `You are the outer agent. Download the assigned Helix task, capture real broken/working media, and supply the shortest fair prompt.`,
    `Guide the technical build through a recorded helix task author session; verify starter/reference behavior and local oracle.`,
    `Run judgment and four probes in five isolated parallel lanes; inspect findings and require general repairs. Rerun only affected checks, with at most five reruns per probe.`,
    `Finalize reasoning.md and disputes.md through recorded saves and wait for trace confirmation.`,
    `Return one ZIP in ${REMOTE_OUTPUT}: <task-name>-handoff.zip containing the unchanged Helix task ZIP and validation-summary.md.`,
    `If blocked or retry limits are exhausted, return <task-name>-recovery-handoff.zip with a work-in-progress ZIP and failure-summary.md, clearly marked incomplete.`,
    `Do not upload, run hosted evaluations, or submit unless the assigned job includes those actions.`,
  ].join(' ')
}

async function runStreamedSessionCommand(
  sandbox: Sandbox,
  sessionPrefix: string,
  commandText: string,
): Promise<void> {
  const sessionId = `${sessionPrefix}-${Date.now()}`
  await sandbox.process.createSession(sessionId)
  try {
    const command = await sandbox.process.executeSessionCommand(
      sessionId,
      {
        command: commandText,
        runAsync: true,
        suppressInputEcho: true,
      },
      0,
    )
    if (!command.cmdId) throw new Error(`Daytona did not return a command ID for ${sessionPrefix}`)

    await sandbox.process.getSessionCommandLogs(
      sessionId,
      command.cmdId,
      (chunk: string) => {
        if (chunk) process.stdout.write(chunk)
      },
      (chunk: string) => {
        if (chunk) process.stderr.write(chunk)
      },
    )

    const completed = await sandbox.process.getSessionCommand(sessionId, command.cmdId)
    if (completed.exitCode !== 0) {
      throw new Error(`${sessionPrefix} exited with status ${String(completed.exitCode)}`)
    }
  } finally {
    await sandbox.process.deleteSession(sessionId).catch(() => undefined)
  }
}

async function loginCodex(sandbox: Sandbox): Promise<void> {
  console.log('Starting one-time ChatGPT device login for this sandbox...')
  console.log('Open the URL printed below, enter its code, and approve access.')
  await runStreamedSessionCommand(
    sandbox,
    'codex-login',
    'env -u OPENAI_API_KEY -u CODEX_API_KEY codex login --device-auth',
  )
  const status = await executeChecked(
    sandbox,
    'env -u OPENAI_API_KEY -u CODEX_API_KEY codex login status',
  )
  if (!/logged in using chatgpt/i.test(status)) {
    throw new Error(`unexpected Codex login status: ${status}`)
  }
  console.log(`Codex authentication ready: ${status}`)
}

async function logoutCodex(sandbox: Sandbox): Promise<void> {
  const result = await sandbox.process.executeCommand(
    'env -u OPENAI_API_KEY -u CODEX_API_KEY codex logout',
    REMOTE_WORKSPACE,
    undefined,
    60,
  )
  if (result.exitCode !== 0) {
    throw new Error(`Codex logout failed: ${result.result.trim() || `status ${String(result.exitCode)}`}`)
  }
  console.log('Removed the sandbox\'s stored Codex login.')
}

async function disconnectHelix(sandbox: Sandbox): Promise<void> {
  const result = await sandbox.process.executeCommand('helix disconnect', REMOTE_WORKSPACE, undefined, 60)
  if (result.exitCode !== 0) console.warn('Helix disconnect did not complete; worker cleanup still required.')
}

async function tryLogoutCodex(sandbox: Sandbox): Promise<boolean> {
  try {
    await logoutCodex(sandbox)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Warning: could not remove the sandbox Codex login cleanly: ${message}`)
    return false
  }
}

async function runAuthenticationSmoke(sandbox: Sandbox, model: string): Promise<void> {
  if (!/^[A-Za-z0-9._-]+$/.test(model)) throw new Error(`unsafe CODEX_MODEL value: ${model}`)
  const result = await executeChecked(
    sandbox,
    `env -u OPENAI_API_KEY -u CODEX_API_KEY codex exec --ephemeral --skip-git-repo-check --model '${model}' --sandbox read-only --color never "Reply only with OK"`,
    300,
  )
  console.log(result)
  if (!/(^|\n)OK(\n|$)/.test(result)) {
    throw new Error('authentication smoke run completed without the expected OK response')
  }
}

const DRY_RUN_SCRIPT = `
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile, ZipInfo
import shutil

output = Path('/output')
output.mkdir(parents=True, exist_ok=True)
for child in output.iterdir():
    if child.is_dir() and not child.is_symlink():
        shutil.rmtree(child)
    else:
        child.unlink()

archive = output / 'controller-smoke.zip'
entry = ZipInfo('smoke.txt', date_time=(1980, 1, 1, 0, 0, 0))
entry.compress_type = ZIP_STORED
entry.external_attr = 0o100644 << 16
with ZipFile(archive, 'w') as bundle:
    bundle.writestr(entry, b'swegen-controller-smoke\\n')
print(archive)
`.trimStart()

async function createDryRunArtifact(sandbox: Sandbox): Promise<void> {
  const remoteScript = '/tmp/swegen-controller-smoke.py'
  await sandbox.fs.uploadFile(Buffer.from(DRY_RUN_SCRIPT, 'utf8'), remoteScript)
  const result = await sandbox.process.executeCommand(`python3 ${remoteScript}`, REMOTE_WORKSPACE, undefined, 60)
  if (result.exitCode !== 0) throw new Error(`dry-run artifact creation failed: ${result.result}`)
  console.log(`Created remote smoke artifact: ${result.result.trim()}`)
}

async function executeChecked(sandbox: Sandbox, command: string, timeout = 120): Promise<string> {
  const result = await sandbox.process.executeCommand(command, REMOTE_WORKSPACE, undefined, timeout)
  if (result.exitCode !== 0) throw new Error(`remote command failed: ${command}\n${result.result}`)
  return result.result.trim()
}

async function configureRv(sandbox: Sandbox): Promise<void> {
  const version = await executeChecked(sandbox, 'rv --version')
  const modeResult = await executeChecked(sandbox, 'rv mode openrouter')
  await executeChecked(
    sandbox,
    "/opt/uv-tools/realm-verifier/bin/python -c 'from rv.cli._common import setup_done; assert setup_done()'",
  )
  console.log(`Realm Verifier ready: ${version}`)
  console.log(`Realm Verifier mode configured inside sandbox: ${modeResult || 'openrouter'}`)
  console.log('Realm Verifier authentication preflight is ready.')
}

async function auditTaskArchive(
  sandbox: Sandbox,
  remotePath: string,
  dryRun: boolean,
): Promise<'passed' | 'incomplete' | 'failed' | 'skipped'> {
  if (dryRun) return 'skipped'
  let result: string
  try {
    result = await executeChecked(
      sandbox,
      `python3 '${REMOTE_ARCHIVE_AUDITOR}' '${remotePath}'`,
      300,
    )
  } catch (error) {
    console.warn(`Multimodal archive audit failed; preserving and downloading the handoff: ${String(error)}`)
    return 'failed'
  }
  let parsed: {
    status?: unknown
    task?: unknown
    commits?: unknown
    fail_to_pass?: unknown
    pass_to_pass?: unknown
    warnings?: unknown
  }
  try {
    parsed = JSON.parse(result) as typeof parsed
  } catch {
    console.warn(`Archive quality audit returned invalid JSON; preserving the handoff: ${result}`)
    return 'failed'
  }
  if (parsed.status === 'incomplete') {
    console.warn('Downloaded handoff is explicitly incomplete and needs follow-up.')
    return 'incomplete'
  }
  if (parsed.status !== 'ok') {
    console.warn(`Archive quality audit reported a problem; preserving the handoff: ${result}`)
    return 'failed'
  }
  console.log(
    `Multimodal task archive verified: ${String(parsed.task)}; ` +
      `${String(parsed.commits)} commits; ` +
      `${String(parsed.fail_to_pass)} F2P; ${String(parsed.pass_to_pass)} P2P`,
  )
  if (Array.isArray(parsed.warnings)) {
    for (const warning of parsed.warnings) console.warn(`Archive audit warning: ${String(warning)}`)
  }
  return 'passed'
}

async function normalizeRemoteOutput(sandbox: Sandbox): Promise<void> {
  const listing = await executeChecked(
    sandbox,
    "find /output -mindepth 1 -maxdepth 1 -printf '%y %f\\n' | LC_ALL=C sort",
  )
  const entries = listing.split('\n').map((line) => line.trim()).filter(Boolean)
  const files = entries
    .filter((entry) => entry.startsWith('f '))
    .map((entry) => entry.slice(2))
    .filter((name) => /^[A-Za-z0-9._-]+$/.test(name))

  if (entries.length === 1 && files.length === 1 && files[0].endsWith('.zip')) return
  if (files.length === 0) {
    throw new Error(`/output contains no regular files to recover: ${entries.join(', ') || '(empty)'}`)
  }

  const zipFiles = files.filter((name) => name.endsWith('.zip'))
  const base = zipFiles.length === 1
    ? zipFiles[0].replace(/\.zip$/, '')
    : 'swegen-output'
  const collectedName = `${base}-controller-handoff.zip`
  const temporaryPath = `/tmp/${collectedName}`
  const quotedFiles = files.map((name) => `'${name}'`).join(' ')

  console.warn(
    `Worker left a noncanonical /output layout (${entries.join(', ')}). ` +
      `The controller will preserve it in ${collectedName} instead of failing the job.`,
  )
  await executeChecked(
    sandbox,
    `rm -f '${temporaryPath}' && cd '${REMOTE_OUTPUT}' && zip -q -0 '${temporaryPath}' ${quotedFiles} && ` +
      `find '${REMOTE_OUTPUT}' -mindepth 1 -maxdepth 1 -delete && mv '${temporaryPath}' '${REMOTE_OUTPUT}/${collectedName}'`,
    300,
  )
}

async function inspectRemoteArtifact(sandbox: Sandbox, dryRun: boolean): Promise<RemoteArtifact> {
  await normalizeRemoteOutput(sandbox)
  const listing = await executeChecked(
    sandbox,
    "find /output -mindepth 1 -maxdepth 1 -printf '%f\\n' | LC_ALL=C sort",
  )
  const names = listing.split('\n').map((name) => name.trim()).filter(Boolean)
  if (names.length !== 1 || !/^[A-Za-z0-9._-]+\.zip$/.test(names[0])) {
    throw new Error(`/output must contain exactly one safely named ZIP; found: ${names.join(', ') || '(empty)'}`)
  }

  const name = names[0]
  const remotePath = `${REMOTE_OUTPUT}/${name}`
  const sizeText = await executeChecked(sandbox, `stat -c '%s' '${remotePath}'`)
  const shaText = await executeChecked(sandbox, `sha256sum '${remotePath}'`)
  await executeChecked(sandbox, `unzip -tq '${remotePath}'`)
  const entryText = await executeChecked(sandbox, `unzip -Z1 '${remotePath}'`)
  const entries = entryText.split('\n').map((entry) => entry.trim()).filter(Boolean)
  validateArchiveEntries(entries, dryRun)
  const auditStatus = await auditTaskArchive(sandbox, remotePath, dryRun)

  const size = Number(sizeText)
  const sha256 = shaText.split(/\s+/)[0]
  if (!Number.isSafeInteger(size) || size <= 0) throw new Error(`invalid remote ZIP size: ${sizeText}`)
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`invalid remote SHA-256: ${shaText}`)

  return { name, path: remotePath, size, sha256, auditStatus }
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) hash.update(chunk)
  return hash.digest('hex')
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

async function chooseLocalPath(outputDir: string, remoteName: string, dryRun: boolean): Promise<string> {
  await fs.mkdir(outputDir, { recursive: true })
  const preferred = dryRun
    ? path.join(outputDir, `controller-smoke-${timestampForFilename()}.zip`)
    : path.join(outputDir, remoteName)
  try {
    await fs.access(preferred)
  } catch {
    return preferred
  }

  const extension = path.extname(remoteName)
  const stem = path.basename(remoteName, extension)
  return path.join(outputDir, `${stem}-${timestampForFilename()}${extension}`)
}

async function downloadAndVerify(
  sandbox: Sandbox,
  artifact: RemoteArtifact,
  outputDir: string,
  dryRun: boolean,
): Promise<string> {
  const localPath = await chooseLocalPath(outputDir, artifact.name, dryRun)
  await sandbox.fs.downloadFile(artifact.path, localPath, 0)
  const [localStat, localSha256] = await Promise.all([fs.stat(localPath), sha256File(localPath)])
  if (localStat.size !== artifact.size || localSha256 !== artifact.sha256) {
    throw new Error(
      `download verification failed: remote ${artifact.size}/${artifact.sha256}, local ${localStat.size}/${localSha256}`,
    )
  }
  return localPath
}

async function downloadFailureLog(sandbox: Sandbox, outputDir: string): Promise<string | undefined> {
  const exists = await sandbox.process.executeCommand(
    `test -s '${REMOTE_FAILURE_LOG}'`,
    REMOTE_WORKSPACE,
    undefined,
    30,
  )
  if (exists.exitCode !== 0) return undefined

  await fs.mkdir(outputDir, { recursive: true })
  const localPath = path.join(outputDir, `codex-worker-failures-${timestampForFilename()}.jsonl`)
  await sandbox.fs.downloadFile(REMOTE_FAILURE_LOG, localPath, 0)
  return localPath
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(usage())
    return
  }
  const options = parseArgs(process.argv.slice(2), process.env.LOCAL_OUTPUT_DIR || './outputs')
  const job = await renderJob(options)
  const runtimeAssets = options.authSmoke
    ? undefined
    : await prepareRuntimeAssets(PROJECT_ROOT, process.env.MEDIA_CAPTURE_KIT_DIR)
  if (!options.authSmoke && !runtimeAssets) throw new Error('MEDIA_CAPTURE_KIT_DIR is required for multimodal task jobs')
  const expectedAccount = options.authSmoke || options.dryRun ? undefined : requireEnv('HELIX_EXPECTED_ACCOUNT')
  const openRouterApiKey = options.authSmoke || options.dryRun ? undefined : await loadOpenRouterApiKey()

  if (options.dryRun) {
    console.log('--- Rendered JOB.md ---')
    console.log(job.trimEnd())
    console.log('--- End JOB.md ---')
  }

  const daytona = new Daytona({ apiKey: requireEnv('DAYTONA_API_KEY') })
  const snapshot = requireEnv('DAYTONA_SNAPSHOT')
  const envVars: Record<string, string> = {}
  if (runtimeAssets) {
    envVars.MEDIA_CAPTURE_KIT_DIR = runtimeAssets.kitDir
    envVars.SWE_MULTIMODAL_SKILL_DIR = runtimeAssets.skillDir
  }
  if (!options.dryRun) {
    envVars.CODEX_MODEL = requireEnv('CODEX_MODEL')
    envVars.CODEX_REASONING_EFFORT = requireEnv('CODEX_REASONING_EFFORT')
  }
  console.log(`Creating Daytona sandbox from snapshot ${snapshot}...`)
  const sandboxKind = options.dryRun ? 'smoke' : options.authSmoke ? 'auth-smoke' : 'job'
  const sandbox = await daytona.create(
    {
      name: `swegen-${sandboxKind}-${Date.now()}`,
      snapshot,
      envVars,
      public: false,
      // Internal builds do not reliably count as Daytona activity, so an
      // inactivity stop can kill healthy work. The wall-clock TTL below is
      // the unconditional backstop instead.
      autoStopInterval: 0,
      autoDeleteInterval: SANDBOX_RECOVERY_RETENTION_MINUTES,
      ttlMinutes: SANDBOX_MAX_LIFETIME_MINUTES,
    },
    { timeout: 600 },
  )
  console.log(`Sandbox created: ${sandbox.id} (${sandbox.name})`)

  let handoffAudit: RemoteArtifact['auditStatus'] = 'skipped'
  let authenticated = false
  let deleted = false
  let handlingSignal = false
  const destroyOnInterruption = async (signal: string) => {
    if (handlingSignal) return
    handlingSignal = true
    console.error(`\nReceived ${signal}; logging out and destroying the disposable sandbox.`)
    await tryLogoutCodex(sandbox)
    await disconnectHelix(sandbox).catch(() => undefined)
    try {
      await sandbox.delete()
      deleted = true
      console.error(`Deleted interrupted sandbox ${sandbox.id}.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Could not delete sandbox ${sandbox.id}; delete it manually in Daytona: ${message}`)
    }
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }
  process.once('SIGINT', () => void destroyOnInterruption('SIGINT'))
  process.once('SIGTERM', () => void destroyOnInterruption('SIGTERM'))

  try {
    await waitForDocker(sandbox)
    if (!options.authSmoke) await uploadJobFiles(sandbox, job)
    if (runtimeAssets) {
      await provisionRuntimeAssets(sandbox, runtimeAssets)
      console.log(`Media capture kit and multimodal skill uploaded and SHA-256 verified (${runtimeAssets.files.length} files).`)
    }
    if (openRouterApiKey) await configureRvAuthentication(sandbox, openRouterApiKey)
    if (!options.authSmoke && !options.dryRun) await configureRv(sandbox)
    if (!options.dryRun) {
      await loginCodex(sandbox)
      authenticated = true
    }
    if (expectedAccount) {
      console.log('Starting Helix pairing for this disposable worker; approve the printed device request.')
      const quotedAccount = quoteShell(expectedAccount)
      await runStreamedSessionCommand(sandbox, 'helix-setup',
        `helix setup --root /home/daytona/helix-tasks --expected-account ${quotedAccount}`)
    }

    if (options.authSmoke) {
      await runAuthenticationSmoke(sandbox, requireEnv('CODEX_MODEL'))
      console.log('Authentication smoke run completed successfully.')
    } else if (options.dryRun) {
      await createDryRunArtifact(sandbox)
    } else {
      await executeChecked(sandbox, 'find /output -mindepth 1 -maxdepth 1 -delete')
      await executeChecked(sandbox, `rm -f '${REMOTE_FAILURE_LOG}'`)
      await runCodexWorker(sandbox, initialWorkerPrompt())
    }

    if (!options.authSmoke) {
      const artifact = await inspectRemoteArtifact(sandbox, options.dryRun)
      handoffAudit = artifact.auditStatus
      console.log(`Remote artifact: ${artifact.path} (${artifact.size} bytes, sha256 ${artifact.sha256})`)
      const localPath = await downloadAndVerify(sandbox, artifact, options.outputDir, options.dryRun)
      console.log(`Verified local artifact: ${localPath}`)
    }

    if (authenticated) {
      await logoutCodex(sandbox)
      authenticated = false
    }
    if (expectedAccount) await disconnectHelix(sandbox)
    console.log(`Deleting completed sandbox ${sandbox.id}...`)
    await sandbox.delete()
    deleted = true
    console.log(
      options.authSmoke
        ? 'Authentication smoke completed successfully.'
        : options.dryRun
          ? 'Dry run completed successfully.'
          : `Multimodal handoff downloaded and verified (archive audit: ${handoffAudit}).`,
    )
  } catch (error) {
    await tryLogoutCodex(sandbox)
    await disconnectHelix(sandbox).catch(() => undefined)
    authenticated = false
    try {
      const failureLog = await downloadFailureLog(sandbox, options.outputDir)
      if (failureLog) console.error(`Saved Codex failure events: ${failureLog}`)
    } catch (logError) {
      const message = logError instanceof Error ? logError.message : String(logError)
      console.error(`Warning: could not download Codex failure events: ${message}`)
    }
    try {
      // End CPU/RAM billing immediately while retaining the filesystem for a
      // short recovery window. Re-anchoring the TTL also guarantees cleanup
      // even if stopping the sandbox itself fails.
      await sandbox.setTtl(SANDBOX_RECOVERY_RETENTION_MINUTES)
      await sandbox.setAutoDeleteInterval(SANDBOX_RECOVERY_RETENTION_MINUTES)
      await sandbox.stop(120)
      console.error(
        `Job failed; stopped recovery sandbox ${sandbox.id}. Its filesystem will be retained for ` +
          `${SANDBOX_RECOVERY_RETENTION_MINUTES} minutes, then deleted automatically.`,
      )
    } catch (cleanupError) {
      const message = cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
      console.error(
        `Warning: could not stop recovery sandbox ${sandbox.id}: ${message}. ` +
          `Its ${SANDBOX_RECOVERY_RETENTION_MINUTES}-minute wall-clock TTL still applies.`,
      )
    }
    throw error
  } finally {
    if (!deleted) console.error(`Recovery sandbox: ${sandbox.id}`)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? `Error: ${error.message}` : error)
  process.exitCode = 1
})
