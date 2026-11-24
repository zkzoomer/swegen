import {constants} from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import {quoteShell} from './utils'

// Helix starts its Codex server and remote TUI through PATH. Scope this CLI
// override to those child processes, retaining the user's config and login.
export async function innerLaunchEnvironment(directory: string, inherited: NodeJS.ProcessEnv = process.env, writableRoots: string[] = []): Promise<NodeJS.ProcessEnv> {
  let executable: string | undefined
  for (const entry of (inherited.PATH || '').split(path.delimiter)) {
    if (!entry) continue
    const candidate = path.resolve(entry, 'codex')
    try {
      await fs.access(candidate, constants.X_OK)
      if ((await fs.stat(candidate)).isFile()) {executable = candidate; break}
    } catch {}
  }
  if (!executable) throw new Error('Codex executable is missing from PATH; install/sign in before inner-start')
  const bin = path.join(directory, 'codex-bin')
  await fs.mkdir(bin, {recursive: true, mode: 0o700})
  const serverOverrides: string[] = []
  if (writableRoots.length) serverOverrides.push('sandbox_mode="workspace-write"',
    'sandbox_workspace_write.writable_roots=' + JSON.stringify(writableRoots.map(root => path.resolve(root))),
    'sandbox_workspace_write.network_access=true')
  const arguments_ = serverOverrides.map(value => '--config ' + quoteShell(value)).join(' ')
  // Helix uses this PATH for both app-server and the remote TUI. The TUI rejects
  // server sandbox overrides; keep them exclusively on the app-server process.
  const wrapper = `#!/bin/sh
for argument do
  case "$argument" in
    app-server)
      exec ${quoteShell(executable)} ${arguments_} "$@"
      ;;
    --remote|--remote=*)
      exec ${quoteShell(executable)} --config 'tui.resume_cwd="session"' "$@"
      ;;
  esac
done
exec ${quoteShell(executable)} "$@"
`
  await fs.writeFile(path.join(bin, 'codex'), wrapper, {mode: 0o700})
  return {...inherited, PATH: bin + path.delimiter + (inherited.PATH || '')}
}
