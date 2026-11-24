const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const {provisionProbeLogin, removeProbeLogin} = require('../dist/probe-auth.js')

test('probe login uses the private file channel and never embeds tokens in commands', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'probe-auth-'))
  try {
    const content = JSON.stringify({tokens: {access_token: 'test-secret-value'}})
    await fs.writeFile(path.join(dir, 'auth.json'), content)
    const commands = [], uploads = []
    const host = {fs: {uploadFile: async (bytes, remote) => uploads.push({bytes: bytes.toString(), remote})}, process: {executeCommand: async command => {commands.push(command); return {exitCode: 0, result: ''}}}}
    await provisionProbeLogin(host, dir)
    assert.deepEqual(uploads, [{bytes: content, remote: '/root/.codex/auth.json'}])
    assert.equal(commands.some(c => c.includes('test-secret-value')), false)
    assert.match(commands[0], /-m 700/)
    assert.match(commands[1], /chmod 600/)
    await removeProbeLogin(host)
    assert.equal(commands.at(-1), 'rm -f /root/.codex/auth.json')
  } finally {await fs.rm(dir, {recursive: true, force: true})}
})

test('failed probe login preflight removes the transferred credential without echoing provider output', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'probe-auth-'))
  try {
    await fs.writeFile(path.join(dir, 'auth.json'), JSON.stringify({tokens: {access_token: 'test-secret-value'}}))
    const commands = []
    const host = {fs: {uploadFile: async () => {}}, process: {executeCommand: async command => {commands.push(command); return {exitCode: command.includes('chmod') ? 1 : 0, result: 'test-secret-value'}}}}
    await assert.rejects(provisionProbeLogin(host, dir), error => error.message === 'Codex probe login preflight failed')
    assert.equal(commands.at(-1), 'rm -f /root/.codex/auth.json')
  } finally {await fs.rm(dir, {recursive: true, force: true})}
})
