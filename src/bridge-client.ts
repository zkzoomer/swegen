import * as http from 'node:http'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {createHash} from 'node:crypto'
import {saveTaskText} from './task-text'

async function main(): Promise<void> {
  const [action, ...args] = process.argv.slice(2)
  const options: Record<string, string> = {action}
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || args[i+1] == null) throw new Error('Expected --name value')
    options[args[i].slice(2)] = args[i+1]
  }
  const contextPath = options.context || process.env.SWEGEN_CONTEXT_PATH
  if (!contextPath) throw new Error('SWEGEN_CONTEXT_PATH is missing; invoke this helper from a running local job')
  const context = JSON.parse(await fs.readFile(contextPath, 'utf8'))
  // A fresh helper process can deliver coordinator steering to an already-running
  // outer. Keep RPC stdout unchanged and never consume another task's notice.
  if (process.env.SWEGEN_OUTER_WORKSPACE && context.logs && context.staging &&
      path.resolve(process.env.SWEGEN_OUTER_WORKSPACE) === path.resolve(context.logs, 'outer-workspace')) {
    const noteFile = path.join(context.staging, 'coordinator-inbox.md')
    const ackFile = path.join(context.staging, 'coordinator-inbox.ack')
    const stat = await fs.lstat(noteFile).catch(error => {if (error.code === 'ENOENT') return undefined; throw error})
    if (stat?.isFile() && !stat.isSymbolicLink() && stat.size <= 12000) {
      const note = await fs.readFile(noteFile, 'utf8')
      const hash = createHash('sha256').update(note).digest('hex')
      const acknowledged = await fs.readFile(ackFile, 'utf8').catch(error => {if (error.code === 'ENOENT') return ''; throw error})
      if (acknowledged.trim() !== hash) console.error(`Coordinator update for this task (${noteFile}, sha256 ${hash}):\n${note}\nAfter reading, acknowledge by writing only ${hash} to ${ackFile}.`)
    }
  }
  if (action === 'outer-save-text') {
    if (!options.file) throw new Error('outer-save-text requires --file')
    console.log(JSON.stringify(await saveTaskText(context, options.file, options.name), null, 2)); return
  }
  const result = await new Promise<string>((resolve, reject) => {
    const request = http.request({socketPath: context.socket, path: '/action', method: 'POST', headers: {'Content-Type': 'application/json'}}, response => {
      let body = ''; response.on('data', data => {body += data}); response.on('end', () => resolve(body))
    })
    request.on('error', reject); request.end(JSON.stringify(options))
  })
  const parsed = JSON.parse(result)
  if (!parsed.ok) throw new Error(parsed.error)
  console.log(JSON.stringify(parsed.result, null, 2))
}
main().catch(error => {console.error(String(error)); process.exitCode = 1})
