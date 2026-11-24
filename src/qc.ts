import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {createHash} from 'node:crypto'

type RecordResult = {check_id: string; status: string; output?: {outcome?: string; flagged?: boolean; verdict?: string}; error?: string}
type Dispute = {check_id: string; reason: string; evidence: string[]}
export type QcState = {status: 'passed' | 'review_required' | 'incomplete'; issues: string[]; disputes: Dispute[]; evidence: string}

// Raw rv results remain authoritative. A local dispute never becomes a PASS.
export async function assessQc(staging: string, task: string, disputes: Dispute[] = []): Promise<QcState> {
  const root = path.join(staging, 'qc-results')
  const ledgerBytes = await fs.readFile(path.join(root, 'ledger.json'))
  const ledger = JSON.parse(ledgerBytes.toString()) as {initial_judgment: number; batches: {status: string; checks: string[]; lanes: {result: string; checks: string[]; execution_error?: string}[]}[]}
  const latest = new Map<string, RecordResult>(), issues: string[] = []
  const laneErrors = new Map<string, string>()
  const digest = createHash('sha256').update(ledgerBytes)
  let preflight = false, judgment = false
  for (const batch of ledger.batches) {
    if (batch.status !== 'finished') {batch.checks.forEach(check => laneErrors.set(check, 'QC batch did not finish: ' + check)); continue}
    for (const lane of batch.lanes) {
      if (!/^[a-z0-9-]+\.json$/.test(lane.result)) throw new Error('Unsafe QC result path')
      const bytes = await fs.readFile(path.join(root, lane.result)); digest.update(lane.result).update(bytes)
      try {
        const records = (JSON.parse(bytes.toString()) as {records: RecordResult[]}).records
        if (!Array.isArray(records) || !records.length) throw new Error('No check records')
        if (lane.result.startsWith('preflight-')) preflight = true
        if (lane.checks.includes('judgment')) judgment = true
        lane.checks.forEach(check => laneErrors.delete(check))
        records.forEach(record => latest.set(record.check_id, record))
      } catch {lane.checks.forEach(check => laneErrors.set(check, 'Missing/invalid QC results: ' + lane.result))}
    }
  }
  issues.push(...laneErrors.values())
  if (!preflight) issues.push('Static preflight has not completed')
  if (!judgment || !ledger.initial_judgment) issues.push('Initial judgment stage has not completed')
  for (const probe of ['gameability', 'altsolve', 'leakage', 'media-ablation']) {
    if (!latest.has('swemultimodal/probe-' + probe)) issues.push('Missing probe: ' + probe)
  }
  const notes = await fs.readFile(path.join(task, 'disputes.md'), 'utf8').catch(() => '')
  const accepted: Dispute[] = []
  for (const record of latest.values()) {
    const output = record.output || {}
    const passed = record.status === 'completed' && ['pass', 'passed'].includes(output.outcome || '') && !output.flagged
    if (passed) continue
    const dispute = disputes.find(d => d.check_id === record.check_id)
    if (record.status !== 'error' && dispute?.reason?.trim() && dispute.evidence?.length && notes.includes(record.check_id)) {
      for (const name of dispute.evidence) {
        const file = await fs.realpath(path.resolve(staging, name))
        if (!file.startsWith(await fs.realpath(staging) + path.sep) || !(await fs.stat(file)).isFile()) throw new Error('Dispute evidence must be a staging file')
        digest.update(name).update(await fs.readFile(file))
      }
      accepted.push(dispute)
    } else issues.push(record.check_id + ': ' + (record.error ? 'execution error' : output.outcome || record.status))
  }
  return {status: issues.length ? 'incomplete' : accepted.length ? 'review_required' : 'passed', issues, disputes: accepted, evidence: digest.digest('hex')}
}
