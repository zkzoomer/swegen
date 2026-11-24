import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

type ProbeHost = {
  fs: {uploadFile(content: Buffer, remote: string): Promise<unknown>}
  process: {executeCommand(command: string): Promise<{exitCode?: number; result: string}>}
}
const remoteLogin = '/root/.codex/auth.json'

// rv's multimodal probes deliberately use Codex, independently of judge mode.
// Transfer only its login, over the private SDK channel, never through command text.
export async function provisionProbeLogin(host: ProbeHost, codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex')): Promise<void> {
  const content = await fs.readFile(path.join(codexHome, 'auth.json'))
  const login = JSON.parse(content.toString('utf8'))
  if (!login.tokens?.access_token && !login.OPENAI_API_KEY) {
    throw new Error('Codex probe login is missing; run codex login before starting')
  }
  const directory = await host.process.executeCommand('install -d -m 700 /root/.codex')
  if (directory.exitCode !== 0) throw new Error('Cannot prepare private probe login directory')
  try {
    await host.fs.uploadFile(content, remoteLogin)
    const checked = await host.process.executeCommand('chmod 600 /root/.codex/auth.json && /opt/uv-tools/realm-verifier/bin/python -c \'from rv.cli._common import subscription_login_present; assert subscription_login_present("codex")\'')
    if (checked.exitCode !== 0) throw new Error('Codex probe login preflight failed')
  } catch (error) {
    await removeProbeLogin(host).catch(() => undefined)
    throw error
  }
}

export async function removeProbeLogin(host: ProbeHost): Promise<void> {
  const result = await host.process.executeCommand('rm -f /root/.codex/auth.json')
  if (result.exitCode !== 0) throw new Error('Could not remove the compute worker probe login')
}
