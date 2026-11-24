import {constants} from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {quoteShell} from './utils'

// All jobs sharing this local Helix installation must use one queue, including
// commands issued by the outer agent rather than by the controller itself.
export async function helixLaunchEnvironment(directory: string, gateScript: string,
                                             inherited: NodeJS.ProcessEnv = process.env): Promise<NodeJS.ProcessEnv> {
  let executable: string | undefined
  for (const entry of (inherited.PATH || '').split(path.delimiter)) {
    if (!entry) continue
    const candidate = path.resolve(entry, 'helix')
    try {
      await fs.access(candidate, constants.X_OK)
      if ((await fs.stat(candidate)).isFile()) {executable = candidate; break}
    } catch {}
  }
  if (!executable) throw new Error('Helix executable is missing from PATH')
  await fs.access(gateScript)
  await fs.mkdir(directory, {recursive: true, mode: 0o700})
  await fs.writeFile(path.join(directory, 'helix'),
    `#!/bin/sh\nexec python3 ${quoteShell(gateScript)} ${quoteShell(executable)} "$@"\n`, {mode: 0o700})
  return {...inherited, PATH: directory + path.delimiter + (inherited.PATH || ''),
    SWEGEN_HELIX_JOB: directory,
    SWEGEN_HELIX_GATE_LOCK: inherited.SWEGEN_HELIX_GATE_LOCK || path.join(inherited.HOME || os.homedir(), '.cache/swegen/helix.lock')}
}
