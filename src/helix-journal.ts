import {createHash} from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

export type JournalBaseline = {entries: Map<string, {size: number; sha256: string}>; startedAt: number}
export type JournalProof = {saved: true; journal: string; sha256: string} | {saved: false; error: string}

export function authorJournalRoots(): string[] {
  return ['.micro1-helix', '.helix'].map(name => path.join(os.homedir(), name, 'journal/author'))
}
const digest = (data: Buffer): string => createHash('sha256').update(data).digest('hex')

async function matchingJournals(taskDir: string, roots: string[]): Promise<string[]> {
  const task = await fs.realpath(taskDir)
  const matches: string[] = []
  for (const root of roots) {
    let entries: import('node:fs').Dirent[]
    try {entries = await fs.readdir(root, {withFileTypes: true})} catch {continue}
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const directory = path.join(root, entry.name)
      try {
        const session = JSON.parse(await fs.readFile(path.join(directory, 'session.json'), 'utf8'))
        if (typeof session.directory === 'string' && await fs.realpath(session.directory) === task) matches.push(directory)
      } catch { /* Missing or unrelated metadata is not evidence for this task. */ }
    }
  }
  return matches
}

// Capture the existing bytes before launching Helix. An older completed upload
// cannot certify a new segment, even when Helix resumes the same journal/thread.
export async function snapshotAuthorJournals(taskDir: string, roots = authorJournalRoots()): Promise<JournalBaseline> {
  const baseline: JournalBaseline = {entries: new Map(), startedAt: Date.now()}
  for (const directory of await matchingJournals(taskDir, roots)) {
    try {
      const data = await fs.readFile(path.join(directory, 'events.jsonl'))
      baseline.entries.set(directory, {size: data.length, sha256: digest(data)})
    } catch {baseline.entries.set(directory, {size: 0, sha256: digest(Buffer.alloc(0))})}
  }
  return baseline
}

// This is a read-only check of Helix's own upload receipt and capture journal.
// Console wording and upload-only's count of newly uploaded sessions are irrelevant.
export async function verifyAuthorJournal(taskDir: string, baseline: JournalBaseline,
                                          roots = authorJournalRoots()): Promise<JournalProof> {
  let error = 'No new completed, uploaded Helix capture found for this task'
  for (const directory of await matchingJournals(taskDir, roots)) {
    try {
      const metadata = path.join(directory, 'session.json')
      const session = JSON.parse(await fs.readFile(metadata, 'utf8'))
      const data = await fs.readFile(path.join(directory, 'events.jsonl'))
      const previous = baseline.entries.get(directory)
      const offset = previous?.size ?? 0
      if (data.length <= offset) {error = 'Helix journal has no new capture for this author segment'; continue}
      if (previous && digest(data.subarray(0, offset)) !== previous.sha256) {
        error = 'Helix journal history changed instead of appending a new capture'; continue
      }
      const records = data.subarray(offset).toString('utf8').trim().split('\n').map(line => JSON.parse(line))
      const last = records[records.length - 1]
      if (!records.some(record => record.helix_event === 'capture_started' && record.session_id === session.id &&
                          typeof record.recorded_at === 'number' && record.recorded_at * 1000 + 999 >= baseline.startedAt) ||
          last?.helix_event !== 'capture_ended' || last.complete !== true) {
        error = 'The current Helix capture is not complete'; continue
      }
      if (session.pending_snapshot !== null) {error = 'Helix still has a pending authoring upload'; continue}
      const sha256 = digest(data)
      if (typeof session.thread_id !== 'string' || !session.thread_id || session.uploaded_digest !== sha256) {
        error = 'Helix upload receipt does not match the complete authoring journal'; continue
      }
      // Do not accept a receipt replaced while the journal was being inspected.
      const latest = JSON.parse(await fs.readFile(metadata, 'utf8'))
      const stat = await fs.stat(path.join(directory, 'events.jsonl'))
      if (latest.id !== session.id || latest.thread_id !== session.thread_id ||
          latest.uploaded_digest !== sha256 || latest.pending_snapshot !== null || stat.size !== data.length) {
        error = 'Helix authoring upload is still changing; check again'; continue
      }
      return {saved: true, journal: directory, sha256}
    } catch {error = 'Helix authoring journal is missing, unreadable or incomplete'}
  }
  return {saved: false, error}
}
