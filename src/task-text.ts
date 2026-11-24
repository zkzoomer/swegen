import {constants} from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {createHash} from 'node:crypto'

// The user explicitly assigns these two documents to the outer agent. Keep this
// narrow path separate from the recorded inner's technical task-file changes.
export async function saveTaskText(context: {staging: string; taskDir: string; logs: string}, file: string, name = path.basename(file)) {
  if (!['instruction.md', 'reasoning.md'].includes(name)) throw new Error('Only instruction.md and reasoning.md can be saved by the outer text writer')
  const staging = await fs.realpath(context.staging), source = await fs.realpath(file)
  const relative = path.relative(staging, source)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Task text source must be inside current author staging')
  const text = await fs.readFile(source, 'utf8')
  if (!text.trim() || text.includes('\0') || Buffer.byteLength(text) > 131072 || /\[REMOVE ME:|\[State the task in terms/.test(text)) throw new Error('Task text is empty, invalid or still a template')
  const task = await fs.realpath(context.taskDir)
  await fs.access(path.join(task, 'task.toml'))
  const destination = path.join(task, name)
  const handle = await fs.open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644)
  try {await handle.writeFile(text); await handle.sync()} finally {await handle.close()}
  const sha256 = createHash('sha256').update(text).digest('hex')
  await fs.appendFile(path.join(context.logs, 'outer-text-writes.jsonl'), JSON.stringify({timestamp: new Date().toISOString(), name, sha256, bytes: Buffer.byteLength(text)}) + '\n', {mode: 0o600})
  return {saved: destination, sha256, bytes: Buffer.byteLength(text), note: 'Task text changed; a final oracle must cover these inputs'}
}
