import {spawn} from 'node:child_process'
import {appendFileSync, mkdirSync} from 'node:fs'
import * as path from 'node:path'

export type CommandResult = {exitCode: number; stdout: string; stderr: string}
export function runLocal(command: string, args: string[], cwd: string, log?: string,
                         env: NodeJS.ProcessEnv = process.env, signal?: AbortSignal): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe']})
    const cancel = () => child.kill('SIGINT')
    signal?.addEventListener('abort', cancel, {once: true})
    if (signal?.aborted) cancel()
    let stdout = '', stderr = ''
    if (log) mkdirSync(path.dirname(log), {recursive: true, mode: 0o700})
    child.stdout.on('data', (data: Buffer) => {stdout += data; if (log) appendFileSync(log, data, {mode: 0o600})})
    child.stderr.on('data', (data: Buffer) => {stderr += data; if (log) appendFileSync(log, data, {mode: 0o600})})
    child.on('error', reject)
    child.on('close', code => {signal?.removeEventListener('abort', cancel); resolve({exitCode: code ?? 1, stdout, stderr})})
  })
}
export function fullOracleReward(output: string): boolean {
  let records: unknown[]
  try {records = [JSON.parse(output.trim())]} catch {
    records = output.split('\n').flatMap(line => {try {return [JSON.parse(line)]} catch {return []}})
  }
  const rewards: number[] = []
  function visit(value: unknown): void {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (/^(reward|mean_reward)$/.test(key) && (typeof child === 'number' || typeof child === 'string' && /^\d+(?:\.\d+)?$/.test(child))) rewards.push(Number(child))
      else if (typeof child === 'object') visit(child)
    }
  }
  records.forEach(visit)
  return rewards.length > 0 && rewards.every(reward => reward === 1)
}
