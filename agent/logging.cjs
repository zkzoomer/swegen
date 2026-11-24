// Shared by the local controller and outer agent; tested without an SDK or worker.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const {stripVTControlCharacters} = require('node:util')

function secretValues(env = process.env, home = os.homedir()) {
  const values = Object.entries(env)
    .filter(([name, value]) => /(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|PASSWORD|SECRET)$/.test(name) && value)
    .map(([, value]) => value)
  function visit(value, key = '') {
    if (typeof value === 'string' && /(?:token|api_key|secret|password)$/i.test(key)) values.push(value)
    else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) visit(v, k)
  }
  for (const file of ['.codex/auth.json', '.rv/auth.json']) {
    try { visit(JSON.parse(fs.readFileSync(path.join(home, file), 'utf8'))) } catch {}
  }
  return values.filter(value => value.length >= 8)
}

function createRedactor(values = []) {
  const secrets = new Set()
  function add(value) {
    if (value && value.length >= 8) {
      secrets.add(value)
      secrets.add(Buffer.from(value).toString('base64'))
    }
  }
  values.forEach(add)
  function redact(value) {
    let text = String(value)
    for (const secret of [...secrets].sort((a,b) => b.length - a.length)) text = text.split(secret).join('[REDACTED]')
    return text
      .replace(/\bsk-(?:or-v1-)?[A-Za-z0-9_-]{20,}\b/g, '[REDACTED]')
      .replace(/(Bearer\s+)[A-Za-z0-9._~-]{16,}/gi, '$1[REDACTED]')
      .replace(/("(?:access_token|refresh_token|id_token|api_key|openrouter_api_key|daytona_api_key|password|secret)"\s*:\s*")[^"\r\n]+"/gi, '$1[REDACTED]"')
  }
  return {add, redact}
}

// A command can contain a whole heredoc or generated script. Show its first line;
// the completed command is retained once in the compact journal for inspection.
function commandPreview(command, limit = 240) {
  const lines = stripVTControlCharacters(String(command)).trim().split(/\r?\n/)
  const first = lines[0].replace(/\s+/g, ' ')
  return first.slice(0, limit) + (first.length > limit ? '…' : '') +
    (lines.length > 1 ? ` [${lines.length - 1} more lines]` : '')
}

function formatWorkerItem(item) {
  switch (item.type) {
    case 'command_execution': return item.command ? `$ ${commandPreview(item.command)}` : ''
    case 'mcp_tool_call': return `Tool: ${item.server}/${item.tool}`
    case 'web_search': return `Search: ${commandPreview(item.query)}`
    case 'error': return `Error: ${commandPreview(item.message)}`
    default: return ''
  }
}

// Commands appear when they start, once per item, rather than after their output.
function createProgressReporter(report) {
  const shown = new Set()
  return event => {
    if (!['item.started', 'item.updated', 'item.completed'].includes(event.type)) return
    const item = event.item
    const key = item.id ?? `${item.type}:${item.command ?? item.tool ?? item.query ?? item.message}`
    if (shown.has(key)) return
    const message = formatWorkerItem(item)
    if (message) { shown.add(key); report(message) }
  }
}

function createWorkerLog(directory, redactor) {
  fs.mkdirSync(directory, {recursive: true, mode: 0o700})
  const eventsPath = path.join(directory, 'outer-events.jsonl')
  const clean = value => redactor.redact(stripVTControlCharacters(String(value)))
  let failures = 0
  return {
    event(event) {
      let summary
      let diagnostic
      switch (event.type) {
        case 'item.completed': {
          const item = event.item
          const base = {id: item.id, type: item.type, status: item.status}
          if (item.type === 'command_execution') {
            summary = {type: event.type, item: {...base, command: item.command, exit_code: item.exit_code}}
            if (item.status === 'failed' || (item.exit_code != null && item.exit_code !== 0)) diagnostic = item.aggregated_output
          } else if (item.type === 'mcp_tool_call') {
            summary = {type: event.type, item: {...base, server: item.server, tool: item.tool}}
            if (item.error || item.status === 'failed') diagnostic = JSON.stringify(item.error ?? item.result)
          } else if (item.type === 'file_change') {
            summary = {type: event.type, item: {...base, changes: item.changes}}
          } else if (item.type === 'web_search') {
            summary = {type: event.type, item: {...base, query: item.query}}
          } else if (item.type === 'error') {
            summary = {type: event.type, item: {...base, message: item.message}}
          }
          break
        }
        case 'run.input': summary = {type: event.type, prompt_characters: event.prompt?.length ?? 0}; break
        case 'thread.started': summary = {type: event.type, thread_id: event.thread_id}; break
        case 'turn.started': summary = {type: event.type}; break
        case 'turn.completed': summary = {type: event.type, usage: event.usage}; break
        case 'turn.failed': summary = {type: event.type, error: event.error}; break
        case 'error': summary = {type: event.type, message: event.message}; break
        case 'run.error': summary = {type: event.type, message: event.message}; break
        case 'run.finished': summary = {type: event.type, failed: event.failed}; break
      }
      if (!summary) return
      let diagnosticPath
      if (diagnostic) {
        const diagnostics = path.join(directory, 'diagnostics')
        fs.mkdirSync(diagnostics, {recursive: true, mode: 0o700})
        diagnosticPath = path.join(diagnostics, `failure-${++failures}.txt`)
        fs.writeFileSync(diagnosticPath, clean(diagnostic), {mode: 0o600})
        summary.diagnostic = diagnosticPath
      }
      fs.appendFileSync(eventsPath, clean(JSON.stringify({timestamp: new Date().toISOString(), event: summary})) + '\n', {mode: 0o600})
      return diagnosticPath
    },
    // stdout is already saved by the controller. Do not make a second text copy.
    text: clean,
  }
}

function installTranscript(file, redactor) {
  fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700})
  const fd = fs.openSync(file, 'ax', 0o600)
  const restores = []
  let active = true
  for (const [name, stream] of [['stdout', process.stdout], ['stderr', process.stderr]]) {
    const original = stream.write
    let pending = ''
    function save(text) {
      fs.writeSync(fd, redactor.redact(`[${new Date().toISOString()}] [${name}] ${stripVTControlCharacters(text)}`))
    }
    stream.write = function(chunk, encoding, callback) {
      const decoded = Buffer.isBuffer(chunk) ? chunk.toString(typeof encoding === 'string' ? encoding : 'utf8') : String(chunk)
      pending += decoded
      const last = pending.lastIndexOf('\n')
      if (last >= 0) { save(pending.slice(0,last+1)); pending = pending.slice(last+1) }
      return original.call(this, chunk, encoding, callback)
    }
    restores.push(() => { stream.write = original; if (pending) save(pending + '\n') })
  }
  return () => {
    if (!active) return
    active = false
    restores.forEach(restore => restore())
    fs.fsyncSync(fd)
    fs.closeSync(fd)
  }
}
module.exports = {secretValues, createRedactor, commandPreview, formatWorkerItem, createProgressReporter, createWorkerLog, installTranscript}
