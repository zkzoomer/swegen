import * as http from 'node:http'
import * as fs from 'node:fs/promises'
import {appendFileSync} from 'node:fs'
import * as path from 'node:path'
import {AuthorTerminal} from './author-terminal'
import {ComputeWorker} from './worker'
import {waitFor, waitSeconds} from './wait'
import {quoteShell} from './utils'
import {provisionProbeLogin} from './probe-auth'
import {assessQc, type QcState} from './qc'
import {fullOracleReward, runLocal} from './local-process'

export class LocalBridge {
  readonly terminal: AuthorTerminal
  private server?: http.Server
  private oracle?: {running: boolean; passed: boolean; exitCode: number | null; input: string; log: string; error?: string}
  private oracleWork?: Promise<void>
  private oracleAbort?: AbortController
  private qc?: {input: string; review: QcState}
  private qcJobs = new Set<string>()
  constructor(private project: string, readonly taskDir: string, private staging: string,
              private logs: string, readonly worker: ComputeWorker,
              private redact: (value: unknown) => string = String) {
    this.terminal = new AuthorTerminal(path.join(project, 'scripts/author_pty.py'), taskDir, logs, redact, undefined, [taskDir, staging])
  }
  private async fingerprint(): Promise<string> {
    const r = await runLocal('python3', [path.join(this.project, 'scripts/task_snapshot.py'), 'scan', this.taskDir], this.project)
    if (r.exitCode) throw new Error(r.stderr)
    return JSON.parse(r.stdout).id
  }
  async dispatch(request: Record<string, string>): Promise<unknown> {
    const action = request.action
    appendFileSync(path.join(this.logs, 'bridge-events.jsonl'), this.redact(JSON.stringify({timestamp: new Date().toISOString(), request})) + '\n', {mode: 0o600})
    switch (action) {
      case 'inner-start':
        if (this.oracle?.running) throw new Error('Wait for the local oracle to finish before opening another writer')
        console.log('[inner] $ helix task author')
        return this.terminal.start()
      case 'inner-read': return this.terminal.read()
      case 'inner-wait': {
        const initial = await this.terminal.read()
        return waitFor(() => this.terminal.read(), state => !state.running || (!initial.ready && state.ready) ||
          /would you like to run|do you want to run|requires your approval|1\. Yes, proceed/i.test(state.screen.slice(-6000)), waitSeconds(request.timeout))
      }
      case 'inner-key': this.terminal.key(request.key); return {sent: true}
      case 'inner-send': {
        const state = await this.terminal.read()
        if (state.running && !state.ready) return {sent: false, ready: false, phase: state.phase,
          note: 'No input was sent. Use inner-wait until ready=true, then retry this request.'}
        this.terminal.send(await fs.readFile(request.file, 'utf8')); return {sent: true}
      }
      case 'inner-exit': {
        const state = await this.terminal.read()
        this.terminal.exit()
        return {requested: true, queuedCancelled: state.launchStarted === false,
          note: state.launchStarted === false ? 'Wait for running=false. Helix never started, so no authoring trace exists for this cancelled queue entry.'
            : 'Use inner-wait until process exits and traceSaved is true.'}
      }
      case 'inner-interrupt': this.terminal.interrupt(); return {interrupted: true, note: 'This does not confirm a saved trace.'}
      case 'worker-sync': {
        const source = await fs.realpath(request.source || this.taskDir)
        const relative = path.relative(this.staging, source)
        if (source !== this.taskDir && (relative.startsWith('..') || path.isAbsolute(relative))) throw new Error('Sync only the linked task or author staging')
        return this.worker.sync(source)
      }
      case 'worker-run': return this.worker.start(await fs.readFile(request.file, 'utf8'), request.cwd)
      case 'worker-status': return this.worker.status(request.job)
      case 'worker-wait': {
        const state = await waitFor(() => this.worker.status(request.job) as Promise<{running: boolean}>, value => !value.running, waitSeconds(request.timeout))
        return state.running ? state : {...state, logs: await this.worker.logs(request.job)}
      }
      case 'worker-fetch-many': {
        const files = JSON.parse(await fs.readFile(request.file, 'utf8')) as {remote: string; local: string}[]
        if (!Array.isArray(files)) throw new Error('Expected an array of remote/local paths')
        const results = []
        for (let i = 0; i < files.length; i += 4) results.push(...await Promise.allSettled(files.slice(i, i + 4).map(file => this.worker.fetch(file.remote, file.local))))
        return results.map(result => result.status === 'fulfilled' ? result.value : {error: String(result.reason)})
      }
      case 'worker-auth-refresh':
        await provisionProbeLogin(this.worker.sandbox)
        return this.worker.start('python3 /opt/swegen-agent/probe_preflight.py ' + quoteShell(process.env.CODEX_MODEL || 'gpt-6.1-sol'))
      case 'qc-run': {
        if ((await this.worker.running()).some(id => this.qcJobs.has(id))) throw new Error('A QC batch is still running')
        const snapshot = await this.worker.sync(this.taskDir) as {path: string}
        const command = 'python3 /opt/swegen-agent/qc_batch.py ' + quoteShell(snapshot.path) +
          ' /home/daytona/author-staging/qc' + (request.checks ? ' --checks ' + quoteShell(request.checks) : '')
        const job = await this.worker.start(command) as {job: string}
        this.qcJobs.add(job.job)
        this.qc = undefined
        return job
      }
      case 'qc-collect': {
        if ((await this.worker.running()).some(id => this.qcJobs.has(id))) throw new Error('Wait for QC to finish before collecting its results')
        const root = path.join(this.staging, 'qc-results')
        await fs.mkdir(root, {recursive: true, mode: 0o700})
        // Names come from our ledger, not arbitrary artifact payloads. Keep exact rv bytes.
        const destination = path.join(root, 'ledger.json')
        const temporary = path.join(root, `ledger-${Date.now()}.json`)
        await this.worker.fetch('/home/daytona/author-staging/qc/ledger.json', temporary)
        const ledger = JSON.parse(await fs.readFile(temporary, 'utf8'))
        const results: string[] = [...new Set<string>(ledger.batches.flatMap((batch: {lanes: {result: string}[]}) => batch.lanes.map(lane => lane.result)))]
        for (const name of results) {
          if (!/^[a-z0-9-]+\.json$/.test(name)) throw new Error('Unsafe QC result path')
          try {await fs.access(path.join(root, name))} catch {
            await this.worker.fetch('/home/daytona/author-staging/qc/' + name, path.join(root, name))
          }
          if (!name.startsWith('preflight-')) {
            try {
              const raw = JSON.parse(await fs.readFile(path.join(root, name), 'utf8'))
              if (Array.isArray(raw.records)) await fs.copyFile(path.join(root, name), path.join(this.staging, name))
            } catch { /* Preserve invalid raw output in qc-results; the gate reports it. */ }
          }
        }
        await fs.rename(temporary, destination)
        return assessQc(this.staging, this.taskDir)
      }
      case 'qc-finalize': {
        const assessment = request.file ? JSON.parse(await fs.readFile(request.file, 'utf8')) : {disputes: []}
        const review = await assessQc(this.staging, this.taskDir, assessment.disputes)
        this.qc = {input: await this.fingerprint(), review}
        await fs.writeFile(path.join(this.staging, 'qc-completion.json'), JSON.stringify(this.qc, null, 2) + '\n', {mode: 0o600})
        return this.qc
      }
      case 'worker-logs': return this.worker.logs(request.job)
      case 'worker-fetch': return this.worker.fetch(request.remote, request.local)
      case 'oracle-start': {
        if ((await this.terminal.read()).running) throw new Error('Close the inner session and confirm trace saving before local oracle')
        if (!await this.terminal.confirmed()) throw new Error('No fully saved authoring sessions; ' + this.terminal.segments.filter(s => !s.traceSaved).map(s => s.traceError || 'authoring still running').join('; '))
        if (this.oracle?.running) throw new Error('Local oracle is already running')
        const input = await this.fingerprint()
        if (this.oracle?.passed && this.oracle.input === input) return {...this.oracle, reused: true}
        this.oracle = {running: true, passed: false, exitCode: null, input, log: path.join(this.logs, `oracle-${Date.now()}.txt`)}
        const state = this.oracle
        this.oracleAbort = new AbortController()
        console.log(`[local] $ helix task oracle --output json (log: ${state.log})`)
        this.oracleWork = runLocal('helix', ['task', 'oracle', '--output', 'json'], this.taskDir, state.log, process.env, this.oracleAbort.signal).then(async result => {
          state.exitCode = result.exitCode
          state.passed = result.exitCode === 0 && fullOracleReward(result.stdout) && state.input === await this.fingerprint()
          if (!state.passed) state.error = 'Oracle failed, full reward was not found in its JSON, or task inputs changed. Inspect the complete log.'
        }).catch(error => {state.error = String(error)}).finally(() => {state.running = false})
        return state
      }
      case 'oracle-status': return this.oracle ?? {running: false, passed: false, note: 'Final local oracle has not run.'}
      case 'oracle-wait':
        if (!this.oracle) throw new Error('Start the final local oracle first')
        return waitFor(async () => this.oracle!, state => !state.running, waitSeconds(request.timeout))
      default: throw new Error('Unknown bridge action: ' + action)
    }
  }
  async listen(socket: string): Promise<void> {
    this.server = http.createServer(async (request, response) => {
      try {
        if (request.method !== 'POST' || request.url !== '/action') throw new Error('Unsupported request')
        let body = ''
        for await (const chunk of request) {
          body += chunk
          if (body.length > 4 * 1024 * 1024) throw new Error('Bridge request is too large')
        }
        const result = await this.dispatch(JSON.parse(body))
        response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ok: true, result}))
      } catch (error) {
        response.statusCode = 400; response.end(JSON.stringify({ok: false, error: this.redact(String(error))}))
      }
    })
    await new Promise<void>((resolve, reject) => {this.server!.once('error', reject); this.server!.listen(socket, resolve)})
    await fs.chmod(socket, 0o600)
  }
  async assertReady(): Promise<QcState> {
    if (!await this.terminal.confirmed()) throw new Error('Inner authoring traces are not all confirmed saved; ' + this.terminal.segments.filter(s => !s.traceSaved).map(s => s.traceError || 'authoring still running').join('; '))
    if (!this.oracle?.passed || this.oracle.running || this.oracle.input !== await this.fingerprint()) throw new Error('The final unchanged task needs a local Helix oracle with verified reward 1.0')
    const running = await this.worker.running()
    if (running.length) throw new Error('Worker jobs still running: ' + running.join(', '))
    if (!this.qc || this.qc.input !== await this.fingerprint()) throw new Error('Finalize QC on the unchanged final task with qc-finalize')
    const review = await assessQc(this.staging, this.taskDir, this.qc.review.disputes)
    if (review.evidence !== this.qc.review.evidence || review.status === 'incomplete') throw new Error('QC incomplete or changed: ' + review.issues.join('; '))
    return review
  }
  async close(): Promise<void> {
    await this.terminal.stop()
    if (this.oracle?.running) {
      console.warn(`Interrupting local oracle and waiting for its Docker cleanup: ${this.oracle.log}`)
      this.oracleAbort?.abort()
      await this.oracleWork
    }
    if (this.server) await new Promise<void>(resolve => this.server!.close(() => resolve()))
  }
}
