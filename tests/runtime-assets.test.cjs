const assert = require('node:assert/strict')
const { execFile } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { promisify } = require('node:util')
const { test } = require('node:test')
const { prepareRuntimeAssets, provisionRuntimeAssets } = require('../dist/runtime-assets.js')

const exec = promisify(execFile)

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'swegen-runtime-test-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const project = path.join(root, 'project')
  const kit = path.join(root, 'private-kit')
  const files = {
    'README.md': 'private fixture documentation\n',
    'build_media_task.py': '# fixture builder\n',
    'capturekit/README.md': 'fixture API\n',
    'capturekit/capturekit.py': '# fixture library\n',
    'capturekit/ghost_path.js': '// fixture pointer helper\n',
    'scripts/audit_cmds.py': '# fixture audit\n',
    'LICENSE.txt': 'fixture license notice\n',
    'NOTICE': 'preserve this fixture notice\n',
    'jobs/old/private.txt': 'DO NOT TRANSFER\n',
    '.env': 'DO NOT TRANSFER\n',
    'capturekit/__pycache__/library.pyc': 'DO NOT TRANSFER\n',
    'capturekit/node_modules/unrelated/file': 'DO NOT TRANSFER\n',
  }
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(kit, relative)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, contents)
  }
  await fs.chmod(path.join(kit, 'build_media_task.py'), 0o755)
  const skill = path.join(project, 'skills', 'swe-multimodal-task-author')
  await fs.mkdir(path.join(skill, 'references'), { recursive: true })
  await fs.writeFile(path.join(skill, 'SKILL.md'), 'fixture skill\n')
  await fs.writeFile(path.join(skill, 'references', 'media.md'), 'fixture instructions\n')
  return { root, project, kit }
}

function mirrorAssets(assets, root) {
  const mirror = (remote) => path.join(root, 'worker', remote.slice(1))
  return {
    ...assets,
    kitDir: mirror(assets.kitDir),
    skillDir: mirror(assets.skillDir),
    skillLink: mirror(assets.skillLink),
    manifestPath: mirror(assets.manifestPath),
    files: assets.files.map((file) => ({ ...file, destination: mirror(file.destination) })),
  }
}

// Execute the controller's actual installation/checksum/registration commands
// against an isolated local filesystem. No SDK service or model is contacted.
function sandboxFixture({ corrupt = false } = {}) {
  return {
    fs: {
      async uploadFiles(files) {
        for (const file of files) {
          const contents = corrupt && file.destination.endsWith('/capturekit/capturekit.py')
            ? Buffer.from('damaged during transfer')
            : file.source
          await fs.writeFile(file.destination, contents)
        }
      },
    },
    process: {
      async executeCommand(command) {
        try {
          const result = await exec('bash', ['-c', command], { maxBuffer: 1024 * 1024 })
          return { exitCode: 0, result: result.stdout + result.stderr }
        } catch (error) {
          return { exitCode: error.code, result: error.stdout + error.stderr }
        }
      },
    },
  }
}

test('unconfigured jobs do not read or provision runtime tools', async () => {
  assert.equal(await prepareRuntimeAssets('/nonexistent-project', undefined), undefined)
  assert.equal(await prepareRuntimeAssets('/nonexistent-project', '  '), undefined)
})

test('private files stay external; upload plan includes required files, notices, and skill only', async (t) => {
  const { project, kit } = await fixture(t)
  const assets = await prepareRuntimeAssets(project, kit)
  assert.ok(assets)
  const names = assets.files.map((file) => file.destination)
  assert.ok(names.includes('/opt/micro1/media-capture-kit/NOTICE'))
  assert.ok(names.includes('/opt/micro1/media-capture-kit/LICENSE.txt'))
  assert.ok(names.includes('/opt/micro1/media-capture-kit/capturekit/ghost_path.js'))
  assert.ok(names.includes('/opt/swegen/skills/swe-multimodal-task-author/SKILL.md'))
  assert.equal(names.length, 10)
  assert.ok(assets.files.every((file) => !file.contents.toString().includes('DO NOT TRANSFER')))
  await fs.writeFile(path.join(kit, 'build_media_task.py'), 'changed after preparation')
  assert.equal(assets.files.find((file) => file.destination.endsWith('/build_media_task.py')).contents.toString(), '# fixture builder\n')
})

test('kit sources inside the repository are rejected, including symlink aliases', async (t) => {
  const { root, project, kit } = await fixture(t)
  const inside = path.join(project, 'media-capture-kit')
  await fs.cp(kit, inside, { recursive: true })
  await assert.rejects(prepareRuntimeAssets(project, inside), /outside the swegen repository/)
  const alias = path.join(root, 'alias')
  await fs.symlink(inside, alias)
  await assert.rejects(prepareRuntimeAssets(project, alias), /outside the swegen repository/)
})

test('incomplete kits and library symlinks fail before upload', async (t) => {
  const { project, kit, root } = await fixture(t)
  await fs.unlink(path.join(kit, 'capturekit', 'capturekit.py'))
  await assert.rejects(prepareRuntimeAssets(project, kit), /ENOENT/)
  const secret = path.join(root, 'unrelated-private-file')
  await fs.writeFile(secret, 'not part of the kit')
  await fs.symlink(secret, path.join(kit, 'capturekit', 'capturekit.py'))
  await assert.rejects(prepareRuntimeAssets(project, kit), /regular file/)
})

test('runtime upload verifies bytes, preserves execution modes, and registers a reusable skill link', async (t) => {
  const { project, kit, root } = await fixture(t)
  const assets = mirrorAssets(await prepareRuntimeAssets(project, kit), root)
  const sandbox = sandboxFixture()
  await provisionRuntimeAssets(sandbox, assets)
  assert.equal(await fs.realpath(assets.skillLink), assets.skillDir)
  assert.equal(await fs.readFile(path.join(assets.skillLink, 'SKILL.md'), 'utf8'), 'fixture skill\n')
  assert.equal((await fs.stat(path.join(assets.kitDir, 'build_media_task.py'))).mode & 0o777, 0o755)
  for (const file of assets.files) {
    assert.deepEqual(await fs.readFile(file.destination), file.contents)
  }
  const manifest = JSON.parse(await fs.readFile(assets.manifestPath, 'utf8'))
  assert.equal(manifest.files.length, assets.files.length)
  assert.ok(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)))
  await provisionRuntimeAssets(sandbox, assets)
  assert.equal(await fs.realpath(assets.skillLink), assets.skillDir)
})

test('corrupted transfer fails checksum validation before skill discovery is registered', async (t) => {
  const { project, kit, root } = await fixture(t)
  const assets = mirrorAssets(await prepareRuntimeAssets(project, kit), root)
  await assert.rejects(provisionRuntimeAssets(sandboxFixture({ corrupt: true }), assets), /checksum mismatch/)
  await assert.rejects(fs.lstat(assets.skillLink), /ENOENT/)
})

test('existing unrelated skill discovery content is preserved and reported', async (t) => {
  const { project, kit, root } = await fixture(t)
  const assets = mirrorAssets(await prepareRuntimeAssets(project, kit), root)
  await fs.mkdir(assets.skillLink, { recursive: true })
  const file = path.join(assets.skillLink, 'keep.txt')
  await fs.writeFile(file, 'existing user content')
  await assert.rejects(provisionRuntimeAssets(sandboxFixture(), assets), /discovery path already exists/)
  assert.equal(await fs.readFile(file, 'utf8'), 'existing user content')
})
