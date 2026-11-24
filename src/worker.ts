import type {Sandbox} from '@daytona/sdk'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {randomUUID, createHash} from 'node:crypto'
import {createReadStream} from 'node:fs'
import {runLocal} from './local-process'
import {quoteShell} from './utils'
import logging from '../agent/logging.cjs'

const ROOT = '/home/daytona/author-staging'
export class ComputeWorker {
  readonly jobs = new Map<string, {session: string; command: string; directory: string; local: string; started: number; ended?: number; exitCode?: number}>()
  private bases = new Map<string, {manifest: string; id: string}>()
  constructor(readonly sandbox: Sandbox, private project: string, private staging: string,
              private logDir: string, private redact: (value: unknown) => string = String) {}
  async sync(source: string): Promise<unknown> {
    source = await fs.realpath(source)
    const directory = await fs.mkdtemp(path.join(this.staging, 'snapshot-'))
    const bundle = path.join(directory, 'delta.tar.gz'), manifest = path.join(directory, 'manifest.json')
    const base = this.bases.get(source)
    const args = [path.join(this.project, 'scripts/task_snapshot.py'), 'pack', source, bundle, manifest]
    if (base) args.push('--base', base.manifest)
    const packed = await runLocal('python3', args, this.project)
    if (packed.exitCode) throw new Error(packed.stderr)
    const info = JSON.parse(packed.stdout) as {id: string; changed: string[]; excluded: string[]}
    if (base?.id === info.id) {
      const result = await this.checked(`python3 /opt/swegen-agent/task_snapshot.py apply /home/daytona/task-snapshots ${ROOT}/inputs/${info.id}.tar.gz ${ROOT}/inputs/${info.id}.json`, 300)
      return {...JSON.parse(result), id: info.id, reused: true}
    }
    await this.checked(`install -d -m 700 ${ROOT}/inputs`)
    const remoteBundle = `${ROOT}/inputs/${info.id}.tar.gz`, remoteManifest = `${ROOT}/inputs/${info.id}.json`
    await this.sandbox.fs.uploadFile(bundle, remoteBundle)
    await this.sandbox.fs.uploadFile(manifest, remoteManifest)
    const result = await this.checked(`python3 /opt/swegen-agent/task_snapshot.py apply /home/daytona/task-snapshots ${quoteShell(remoteBundle)} ${quoteShell(remoteManifest)}`, 300)
    this.bases.set(source, {manifest, id: info.id})
    return {...JSON.parse(result), id: info.id, changed: info.changed.length, excluded: info.excluded}
  }
  private async checked(command: string, timeout = 60): Promise<string> {
    console.log(this.redact(`[worker] $ ${logging.commandPreview(command)}`))
    const result = await this.sandbox.process.executeCommand(command, ROOT, undefined, timeout)
    if (result.exitCode !== 0) throw new Error(`Worker command failed: ${result.result}`)
    return result.result.trim()
  }
  async start(command: string, cwd = ROOT): Promise<unknown> {
    if (!command.trim()) throw new Error('Empty worker command')
    if (!cwd.startsWith('/home/daytona/') && !cwd.startsWith('/output')) throw new Error('Worker cwd must be in author staging or task snapshots')
    const id = randomUUID(), directory = `${ROOT}/worker-jobs/${id}`
    await this.checked(`install -d -m 700 ${quoteShell(directory)}`)
    await this.sandbox.fs.uploadFile(Buffer.from(command + '\n'), `${directory}/command.sh`)
    await this.sandbox.process.createSession(id)
    console.log(this.redact(`[worker job ${id}] $ ${logging.commandPreview(command)}`))
    const started = await this.sandbox.process.executeSessionCommand(id, {
      command: `cd ${quoteShell(cwd)} && bash ${quoteShell(directory + '/command.sh')} >${quoteShell(directory + '/stdout.log')} 2>${quoteShell(directory + '/stderr.log')}`,
      runAsync: true, suppressInputEcho: true,
    }, 0)
    if (!started.cmdId) throw new Error('Worker returned no command ID')
    const local = path.join(this.logDir, 'worker-jobs', id)
    await fs.mkdir(local, {recursive: true, mode: 0o700})
    await fs.writeFile(path.join(local, 'command.sh'), this.redact(command), {mode: 0o600})
    this.jobs.set(id, {session: id, command: started.cmdId, directory, local, started: Date.now()})
    return {job: id, directory}
  }
  async status(id: string): Promise<unknown> {
    const job = this.jobs.get(id)
    if (!job) throw new Error('Unknown worker job')
    const result = job.ended ? {exitCode: job.exitCode} : await this.sandbox.process.getSessionCommand(job.session, job.command)
    const justFinished = result.exitCode != null && !job.ended
    if (justFinished) {job.ended = Date.now(); job.exitCode = result.exitCode}
    const state = {job: id, exitCode: result.exitCode ?? null, running: result.exitCode == null, directory: job.directory,
      started: new Date(job.started).toISOString(), ended: job.ended ? new Date(job.ended).toISOString() : null,
      seconds: Math.round(((job.ended || Date.now()) - job.started) / 1000)}
    if (justFinished) await fs.writeFile(path.join(job.local, 'status.json'), JSON.stringify(state, null, 2) + '\n', {mode: 0o600})
    return state
  }
  async logs(id: string, tail = 4000): Promise<unknown> {
    const job = this.jobs.get(id)
    if (!job) throw new Error('Unknown worker job')
    const output: Record<string, string> = {}
    for (const name of ['stdout', 'stderr']) {
      const data = await this.sandbox.fs.downloadFile(`${job.directory}/${name}.log`, 60)
      const clean = this.redact(data.toString('utf8'))
      await fs.writeFile(path.join(job.local, `${name}.txt`), clean, {mode: 0o600})
      output[name] = clean.slice(-tail)
    }
    return {...output, fullLogs: job.local, note: `Last ${tail} characters per stream; complete output retained in fullLogs.`}
  }
  async fetch(remote: string, local: string): Promise<unknown> {
    local = path.resolve(local)
    const relative = path.relative(this.staging, local)
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Download destination must be inside local staging; inner author copies final files')
    const allowed = ['/home/daytona/author-staging/', '/home/daytona/capture-staging/', '/output/']
    if (!allowed.some(prefix => remote.startsWith(prefix)) || remote.split('/').includes('..')) throw new Error('Worker fetch must use an author output path')
    await fs.mkdir(path.dirname(local), {recursive: true, mode: 0o700})
    const expected = (await this.checked(`sha256sum ${quoteShell(remote)}`)).split(/\s+/)[0]
    if (!/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid worker artifact checksum')
    const parent = await fs.realpath(path.dirname(local))
    if (!parent.startsWith(await fs.realpath(this.staging) + path.sep) && parent !== await fs.realpath(this.staging)) throw new Error('Download parent escapes staging through a symlink')
    await fs.writeFile(local, '', {flag: 'wx', mode: 0o600})
    try {
      await this.sandbox.fs.downloadFile(remote, local, 0)
      const hash = createHash('sha256')
      for await (const chunk of createReadStream(local)) hash.update(chunk)
      if (hash.digest('hex') !== expected) throw new Error('Worker artifact download checksum mismatch')
      return {local, sha256: expected}
    } catch (error) {
      await fs.rm(local, {force: true}) // An unverified partial file must not masquerade as collected evidence.
      throw error
    }
  }
  async running(): Promise<string[]> {
    const active: string[] = []
    for (const id of this.jobs.keys()) if ((await this.status(id) as {running: boolean}).running) active.push(id)
    return active
  }
}
