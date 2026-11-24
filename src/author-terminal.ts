import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process'
import {mkdirSync, appendFileSync} from 'node:fs'
import * as path from 'node:path'
import {StringDecoder} from 'node:string_decoder'
import {Terminal} from '@xterm/headless'
import {innerLaunchEnvironment} from './inner-launch'
import {authorJournalRoots, snapshotAuthorJournals, verifyAuthorJournal, type JournalBaseline} from './helix-journal'

export type AuthorState = {running: boolean; ready: boolean; phase: 'starting' | 'queued' | 'connecting' | 'ready' | 'closed'; launchStarted: boolean | null; exitCode: number | null; traceSaved: boolean; screen: string; log: string; segment: number; journal?: string; traceError?: string}
export class AuthorTerminal {
  private child?: ChildProcessWithoutNullStreams
  private terminal?: Terminal
  private decoder = new StringDecoder('utf8')
  private queue = Promise.resolve()
  private current?: AuthorState
  private audits = new Map<AuthorState, {baseline: JournalBaseline; forced: boolean}>()
  readonly segments: AuthorState[] = []
  constructor(private script: string, private taskDir: string, private logs: string,
              private redact: (text: unknown) => string = String,
              private journalRoots = authorJournalRoots(), private writableRoots: string[] = []) {}

  async start(command = ['helix', 'task', 'author']): Promise<AuthorState> {
    if (this.current?.running) throw new Error('An inner author session is already running')
    const baseline = await snapshotAuthorJournals(this.taskDir, this.journalRoots)
    const number = this.segments.length + 1
    const dir = path.join(this.logs, `inner-${number}`)
    mkdirSync(dir, {recursive: true, mode: 0o700})
    const environment = await innerLaunchEnvironment(dir, process.env, this.writableRoots)
    this.current = {running: true, ready: false, phase: 'starting', launchStarted: command[0] === 'helix' ? null : true,
      exitCode: null, traceSaved: false, screen: '', log: path.join(dir, 'terminal.txt'), segment: number}
    appendFileSync(this.current.log, `Started: ${command.join(' ')}\n`, {mode: 0o600})
    this.segments.push(this.current)
    this.audits.set(this.current, {baseline, forced: false})
    this.decoder = new StringDecoder('utf8')
    this.terminal?.dispose()
    this.terminal = new Terminal({cols: 160, rows: 50, scrollback: 5000, allowProposedApi: true})
    this.terminal.onData(data => this.input(data)) // Answer terminal capability/cursor queries.
    this.child = spawn('python3', [this.script, ...command], {
      cwd: this.taskDir, stdio: ['pipe', 'pipe', 'pipe'],
      env: {...environment, TERM: 'xterm-256color', OPENAI_API_KEY: undefined, CODEX_API_KEY: undefined},
    })
    const state = this.current
    let pending = ''
    const processRecord = async (record: {type: string; data?: string; code?: number}) => {
      if (record.type === 'output') {
        const text = this.decoder.write(Buffer.from(record.data!, 'base64'))
        await new Promise<void>(resolve => this.terminal!.write(text, resolve))
        const screen = this.renderScreen()
        if (/OpenAI Codex\s*\(/.test(screen) && /^\s*›/m.test(screen)) {
          state.ready = true; state.phase = 'ready'
        }
      } else if (record.type === 'helix_queued') {
        state.launchStarted = false; state.phase = 'queued'
      } else if (record.type === 'helix_started') {
        state.launchStarted = true; state.phase = state.ready ? 'ready' : 'connecting'
      } else if (record.type === 'exit') {
        state.running = false; state.ready = false; state.phase = 'closed'; state.exitCode = record.code ?? 1
        await this.refreshTrace(state)
        this.saveExit(state)
      }
    }
    this.child.stdout.on('data', (chunk: Buffer) => {
      pending += chunk.toString('utf8')
      let end: number
      while ((end = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, end); pending = pending.slice(end + 1)
        this.queue = this.queue.then(() => processRecord(JSON.parse(line))).catch(error => {
          state.traceSaved = false
          appendFileSync(state.log, `\nTERMINAL ERROR: ${this.redact(error)}\n`, {mode: 0o600})
        })
      }
    })
    this.child.stderr.on('data', (chunk: Buffer) => appendFileSync(state.log, this.redact(chunk.toString()), {mode: 0o600}))
    this.child.on('error', error => {
      state.running = false; state.ready = false; state.phase = 'closed'; state.exitCode = 1
      appendFileSync(state.log, this.redact(String(error)), {mode: 0o600})
      this.saveExit(state)
    })
    this.child.on('close', () => {
      this.queue = this.queue.then(() => {
        if (state.running) {state.running = false; state.ready = false; state.phase = 'closed'; state.exitCode = 1; state.traceSaved = false; this.saveExit(state)}
      })
    })
    return this.read()
  }

  private async refreshTrace(state: AuthorState): Promise<void> {
    const audit = this.audits.get(state)!
    if (!state.running && state.launchStarted === false) {
      state.traceSaved = false
      state.traceError = 'Cancelled in queue before Helix started; no authoring trace was created'
      return
    }
    if (state.running || audit.forced) {
      state.traceSaved = false
      state.traceError = audit.forced ? 'Authoring was forcibly terminated' : 'Authoring has not exited'
      return
    }
    // Helix may finish capture but fail its upload and exit nonzero. Supported
    // `author --upload-only` recovery can subsequently save that same capture.
    // The complete, append-only journal and matching upload receipt certify the
    // trace; retain the original exitCode rather than rewriting execution history.
    const proof = await verifyAuthorJournal(this.taskDir, audit.baseline, this.journalRoots)
    const previouslySaved = state.traceSaved
    state.traceSaved = proof.saved
    if (proof.saved) {
      state.journal = proof.journal
      delete state.traceError
      if (!previouslySaved) appendFileSync(state.log, `Trace verified from journal: ${proof.journal} (${proof.sha256})\n`, {mode: 0o600})
    } else {
      delete state.journal
      state.traceError = proof.error
    }
  }
  private saveExit(state: AuthorState): void {
    const result = `Exit: ${state.exitCode}; traceSaved: ${state.traceSaved}` + (state.traceError ? `; ${state.traceError}` : '') + '\n'
    const screen = state.traceSaved ? '' : `Final screen (last 8000 characters):\n${this.renderScreen().slice(-8000)}\n`
    appendFileSync(state.log, result + screen, {mode: 0o600})
  }
  private renderScreen(): string {
    const buffer = this.terminal!.buffer.active
    const lines = []
    for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
    return this.redact(lines.join('\n').trimEnd()).slice(-24000)
  }
  private input(text: string): void {
    if (!this.current?.running || !this.child?.stdin.writable) return
    this.child.stdin.write(JSON.stringify({type: 'input', data: Buffer.from(text).toString('base64')}) + '\n')
  }
  send(text: string): void {
    if (!this.current?.running) throw new Error('Start the inner author session first')
    if (!this.current.ready) throw new Error(`Inner terminal is ${this.current.phase}; wait for ready=true before sending task instructions`)
    if (/[\x00-\x08\x0b-\x1f\x7f]/.test(text)) throw new Error('Author message contains terminal control characters')
    appendFileSync(path.join(path.dirname(this.current.log), 'messages.jsonl'), this.redact(JSON.stringify({timestamp: new Date().toISOString(), text})) + '\n', {mode: 0o600})
    this.input(`\x1b[200~${text}\x1b[201~\r`)
  }
  key(name: string): void {
    const keys: Record<string, string> = {enter: '\r', escape: '\x1b', tab: '\t', up: '\x1b[A', down: '\x1b[B', left: '\x1b[D', right: '\x1b[C', y: 'y', n: 'n'}
    if (!this.current?.running || !keys[name]) throw new Error('Unsupported terminal key or inactive session')
    if (['starting', 'queued'].includes(this.current.phase) || this.current.launchStarted === false) throw new Error('Inner author has not connected; no terminal keys may be sent yet')
    this.input(keys[name])
  }
  exit(): void {
    if (this.current?.launchStarted === false) {this.interrupt(); return}
    if (!this.current?.ready) throw new Error('Wait for the inner terminal to become ready or cancel its queued launch')
    this.input('\x15\x1b[200~/quit\x1b[201~\r')
  }
  interrupt(): void {this.input('\x03')}
  async read(): Promise<AuthorState> {
    await this.queue
    if (!this.current) return {running: false, ready: false, phase: 'closed', launchStarted: null, exitCode: null, traceSaved: false, screen: '', log: '', segment: 0}
    if (!this.current.running) await this.refreshTrace(this.current)
    this.current.screen = this.renderScreen()
    return {...this.current, screen: this.current.screen.slice(-24000)}
  }
  async stop(): Promise<void> {
    if (!this.current?.running) return
    this.audits.get(this.current)!.forced = true
    this.child?.stdin.write(JSON.stringify({type: 'terminate'}) + '\n')
    for (let i = 0; i < 50 && this.current.running; i++) await new Promise(resolve => setTimeout(resolve, 100))
    if (this.current.running) this.child?.kill('SIGKILL')
    this.current.traceSaved = false
  }
  async confirmed(): Promise<boolean> {
    await this.queue
    for (const segment of this.segments) await this.refreshTrace(segment)
    const started = this.segments.filter(segment => segment.launchStarted !== false)
    return !this.segments.some(segment => segment.running) && started.length > 0 && started.every(segment => segment.traceSaved)
  }
}
