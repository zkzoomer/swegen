import * as path from 'node:path'

export type CliOptions = {
  taskUrl: string
  briefFile: string
  dryRun: boolean
  authSmoke: boolean
  outputDir: string
  taskDir: string
}

export function usage(): string {
  return [
    'Usage:',
    '  npm run start -- --task-url <helix-url> --brief-file <assignment.md> [--task-dir <downloaded-folder>] [--output-dir <path>]',
    '  npm run start -- --task-url <helix-url> --brief-file <assignment.md> --dry-run',
    '  npm run start -- --auth-smoke',
    '',
    'The task already exists on Helix. Its downloaded template supplies metadata and IDs.',
    '--brief-file contains the assigned issue/scope, upstream references, and job budget.',
    '--task-dir reuses an already downloaded local task; otherwise Helix downloads it locally.',
    '--dry-run tests the compute worker and transfer without either agent or pairing.',
    '--auth-smoke makes one local Codex test call; it creates no Daytona worker.',
  ].join('\n')
}

export function parseArgs(args: string[], defaultOutput = './outputs'): CliOptions {
  let taskUrl = ''
  let briefFile = ''
  let outputDir = defaultOutput
  let taskDir = ''
  let dryRun = false
  let authSmoke = false
  const flags = new Map<string, (value: string) => void>([
    ['--task-url', value => { taskUrl = value }],
    ['--brief-file', value => { briefFile = value }],
    ['--output-dir', value => { outputDir = value }],
    ['--task-dir', value => { taskDir = value }],
  ])
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--dry-run') { dryRun = true; continue }
    if (arg === '--auth-smoke') { authSmoke = true; continue }
    const equals = arg.indexOf('=')
    const flag = equals < 0 ? arg : arg.slice(0, equals)
    const setter = flags.get(flag)
    if (!setter) throw new Error(`unknown argument: ${arg}`)
    const value = equals < 0 ? args[++i] : arg.slice(equals + 1)
    if (!value?.trim() || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    setter(value)
  }
  if (dryRun && authSmoke) throw new Error('--dry-run and --auth-smoke are mutually exclusive')
  if (!authSmoke) {
    if (!taskUrl.trim()) throw new Error('--task-url is required')
    let url: URL
    try { url = new URL(taskUrl) } catch { throw new Error('invalid Helix task URL') }
    if (url.protocol !== 'https:' || !['helix.micro1.ai', 'stage.helix.micro1.ai'].includes(url.hostname) || url.username || url.password) {
      throw new Error('--task-url must be an HTTPS Helix task URL')
    }
    taskUrl = url.toString()
    if (!briefFile.trim()) throw new Error('--brief-file is required')
  }
  if (!outputDir.trim()) throw new Error('--output-dir cannot be empty')
  return { taskUrl, briefFile: briefFile ? path.resolve(briefFile) : '', dryRun, authSmoke, outputDir: path.resolve(outputDir), taskDir: taskDir ? path.resolve(taskDir) : '' }
}

export function renderJobText(template: string, options: CliOptions, brief: string): string {
  if (!brief.trim()) throw new Error('assignment brief is empty')
  // Replace template tokens once, without interpreting token-shaped text in the supplied brief.
  const values: Record<string, string> = { TASK_URL: options.taskUrl, TASK_BRIEF: brief.trim() }
  const rendered = template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, name: string) => {
    if (!(name in values)) throw new Error(`unknown job template variable: ${name}`)
    return values[name]
  })
  return rendered.endsWith('\n') ? rendered : `${rendered}\n`
}
