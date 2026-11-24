import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Sandbox } from '@daytona/sdk'
import { quoteShell } from './utils'

export const REMOTE_MEDIA_CAPTURE_KIT_DIR = '/opt/micro1/media-capture-kit'

type RuntimeFile = {
  destination: string
  contents: Buffer
  sha256: string
  mode: number
}

export type RuntimeAssets = {
  kitDir: string
  manifestPath: string
  files: RuntimeFile[]
}

const REQUIRED_KIT_FILES = [
  'README.md',
  'build_media_task.py',
  'capturekit/README.md',
  'capturekit/capturekit.py',
  'capturekit/ghost_path.js',
  'scripts/audit_cmds.py',
]
const SKIP_DIRECTORIES = new Set([
  '.git', '__pycache__', 'node_modules', '.venv', 'jobs', 'media-jobs', 'media-tasks',
])

function isWithin(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function addFile(
  localRoot: string,
  relative: string,
  remoteRoot: string,
  files: RuntimeFile[],
): Promise<void> {
  const localPath = path.join(localRoot, relative)
  const stat = await fs.lstat(localPath)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`runtime asset must be a regular file: ${relative}`)
  }
  if (!isWithin(localRoot, await fs.realpath(localPath))) {
    throw new Error(`runtime asset escapes its configured directory: ${relative}`)
  }
  const contents = await fs.readFile(localPath)
  files.push({
    destination: path.posix.join(remoteRoot, ...relative.split(path.sep)),
    contents,
    sha256: createHash('sha256').update(contents).digest('hex'),
    mode: stat.mode & 0o111 ? 0o755 : 0o644,
  })
}

async function addDirectory(
  localRoot: string,
  relative: string,
  remoteRoot: string,
  files: RuntimeFile[],
): Promise<void> {
  const directory = path.join(localRoot, relative)
  const stat = await fs.lstat(directory)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`runtime asset directory must not be a symlink: ${relative}`)
  }
  const entries = await fs.readdir(directory, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name))
  for (const entry of entries) {
    if (SKIP_DIRECTORIES.has(entry.name) || entry.name.startsWith('.') || /\.(?:py[co]|log)$/.test(entry.name)) continue
    const child = path.join(relative, entry.name)
    if (entry.isDirectory()) await addDirectory(localRoot, child, remoteRoot, files)
    else await addFile(localRoot, child, remoteRoot, files)
  }
}

/** Read a bounded, immutable upload plan before creating a billable sandbox. */
export async function prepareRuntimeAssets(
  projectRoot: string,
  configuredKitDir: string | undefined,
): Promise<RuntimeAssets | undefined> {
  if (!configuredKitDir?.trim()) return undefined
  const [project, kitDir] = await Promise.all([
    fs.realpath(projectRoot),
    fs.realpath(path.resolve(configuredKitDir.trim())),
  ])
  if (isWithin(project, kitDir)) {
    throw new Error('MEDIA_CAPTURE_KIT_DIR must point outside the swegen repository')
  }

  // Explicit entrypoints plus the library tree; never upload the surrounding
  // private directory, old capture jobs, caches, or source-control metadata.
  const files: RuntimeFile[] = []
  for (const relative of REQUIRED_KIT_FILES) {
    const stat = await fs.lstat(path.join(kitDir, relative))
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`invalid media capture kit: ${relative} must be a regular file`)
    }
  }
  for (const relative of ['README.md', 'build_media_task.py', 'scripts/audit_cmds.py']) {
    await addFile(kitDir, relative, REMOTE_MEDIA_CAPTURE_KIT_DIR, files)
  }
  await addDirectory(kitDir, 'capturekit', REMOTE_MEDIA_CAPTURE_KIT_DIR, files)
  for (const entry of (await fs.readdir(kitDir)).sort()) {
    if (/^(?:LICENSE|NOTICE|COPYING)(?:[._-].*)?$/i.test(entry)) {
      await addFile(kitDir, entry, REMOTE_MEDIA_CAPTURE_KIT_DIR, files)
    }
  }

  return {
    kitDir: REMOTE_MEDIA_CAPTURE_KIT_DIR,
    manifestPath: '/opt/swegen/runtime-assets-manifest.json',
    files,
  }
}

const VERIFY_ASSETS = String.raw`
import hashlib, json, stat, sys
from pathlib import Path

manifest = json.loads(Path(sys.argv[1]).read_text())
root = Path(manifest["kit_dir"])
if not root.is_dir() or root.is_symlink():
    raise RuntimeError("invalid runtime asset root: " + str(root))
for entry in manifest["files"]:
    file = Path(entry["path"])
    if not (file.is_relative_to(root) and file.resolve().is_relative_to(root.resolve())):
        raise RuntimeError("runtime asset path escapes installation")
    if not stat.S_ISREG(file.lstat().st_mode):
        raise RuntimeError("runtime asset is not a regular file: " + str(file))
    data = file.read_bytes()
    if len(data) != entry["size"] or hashlib.sha256(data).hexdigest() != entry["sha256"]:
        raise RuntimeError("runtime asset checksum mismatch: " + str(file))
    file.chmod(entry["mode"])

print("Verified runtime capture kit")
`

/** Upload private tools only into this running sandbox, never into image layers. */
export async function provisionRuntimeAssets(
  sandbox: Pick<Sandbox, 'fs' | 'process'>,
  assets: RuntimeAssets,
): Promise<void> {
  const directories = new Set([
    assets.kitDir, path.posix.dirname(assets.manifestPath),
    ...assets.files.map((file) => path.posix.dirname(file.destination)),
  ])
  const prepared = await sandbox.process.executeCommand(
    `install -d -m 700 -- ${[...directories].map(quoteShell).join(' ')}`,
    undefined, undefined, 30,
  )
  if (prepared.exitCode !== 0) throw new Error(`cannot prepare runtime asset directories: ${prepared.result}`)
  const manifest = {
    version: 1,
    kit_dir: assets.kitDir,
    files: assets.files.map((file) => ({
      path: file.destination,
      size: file.contents.length,
      sha256: file.sha256,
      mode: file.mode,
    })),
  }
  await sandbox.fs.uploadFiles([
    ...assets.files.map((file) => ({ source: file.contents, destination: file.destination })),
    { source: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), destination: assets.manifestPath },
  ])
  const checked = await sandbox.process.executeCommand(
    `python3 - ${quoteShell(assets.manifestPath)} <<'SWEGEN_RUNTIME_VERIFY'\n${VERIFY_ASSETS}\nSWEGEN_RUNTIME_VERIFY`,
    undefined, undefined, 60,
  )
  if (checked.exitCode !== 0) throw new Error(`runtime asset verification failed: ${checked.result}`)
}
