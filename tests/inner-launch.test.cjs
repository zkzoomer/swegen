const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
const {execFile}=require('node:child_process'),{promisify}=require('node:util')
const run=promisify(execFile),{innerLaunchEnvironment}=require('../dist/inner-launch.js')
test('inner Codex override survives remote arguments, quoted paths and existing login',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"swegen inner's launch-"));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const bin=path.join(root,'original bin');await fs.mkdir(bin)
 await fs.writeFile(path.join(bin,'codex'),'#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),home:process.env.CODEX_HOME,login:process.env.FIXTURE_LOGIN}))\n',{mode:0o700})
 const original={...process.env,PATH:bin+path.delimiter+process.env.PATH,CODEX_HOME:path.join(root,'existing-home'),FIXTURE_LOGIN:'fixture-login'}
 const environment=await innerLaunchEnvironment(path.join(root,'segment'),original)
 const args=['--remote','ws://127.0.0.1:1234/','--remote-auth-token-env','HELIX_CODEX_SESSION_TOKEN','resume','fixture-thread']
 const result=JSON.parse((await run('codex',args,{env:environment})).stdout)
 assert.deepEqual(result.args,['--config','tui.resume_cwd="session"',...args])
 assert.equal(result.home,original.CODEX_HOME);assert.equal(result.login,'fixture-login')
 assert.equal(original.PATH,bin+path.delimiter+process.env.PATH)
 assert.equal((await fs.stat(path.join(root,'segment/codex-bin/codex'))).mode&0o777,0o700)
})
test('missing Codex fails before a broken author segment is registered',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'swegen-no-codex-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 await assert.rejects(innerLaunchEnvironment(root,{PATH:path.join(root,'missing')}),/Codex executable is missing/)
})

test('inner overrides scope writes to task and staging while preserving approval policy',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"swegen scoped's launch-"));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const bin=path.join(root,'bin');await fs.mkdir(bin)
 await fs.writeFile(path.join(bin,'codex'),'#!/usr/bin/env node\nconsole.log(JSON.stringify(process.argv.slice(2)))\n',{mode:0o700})
 const roots=[path.join(root,'task'),path.join(root,'staging')]
 const env=await innerLaunchEnvironment(path.join(root,'segment'),{...process.env,PATH:bin+path.delimiter+process.env.PATH},roots)
 const args=JSON.parse((await run('codex',['app-server','--stdio'],{env})).stdout)
 assert.ok(args.includes('sandbox_mode="workspace-write"'))
 const writable=args.find(x=>x.startsWith('sandbox_workspace_write.writable_roots='))
 assert.deepEqual(JSON.parse(writable.split('=').slice(1).join('=')),roots)
 assert.ok(args.includes('sandbox_workspace_write.network_access=true'))
 assert.ok(!args.some(x=>x.includes('danger-full-access')||x.includes('approval_policy')))
 assert.deepEqual(args.slice(-2),['app-server','--stdio'])
 assert.ok(!args.includes('tui.resume_cwd="session"'))
})

test('remote TUI rejects server-only settings even when writable roots are configured',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'swegen-remote-settings-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const bin=path.join(root,'bin');await fs.mkdir(bin)
 await fs.writeFile(path.join(bin,'codex'),`#!/usr/bin/env node
const args=process.argv.slice(2)
if(args.some(x=>x.startsWith('sandbox_'))){console.error('sandbox overrides are not supported with --remote');process.exit(1)}
console.log(JSON.stringify(args))
`,{mode:0o700})
 const env=await innerLaunchEnvironment(path.join(root,'segment'),{...process.env,PATH:bin+path.delimiter+process.env.PATH},[path.join(root,'task'),path.join(root,'staging')])
 for(const remote of [['--remote','ws://localhost:1234'],['--remote=ws://localhost:1234']]){
  const args=[...remote,'--remote-auth-token-env','HELIX_CODEX_SESSION_TOKEN','resume','fixture-thread']
  assert.deepEqual(JSON.parse((await run('codex',args,{env})).stdout),['--config','tui.resume_cwd="session"',...args])
 }
 assert.deepEqual(JSON.parse((await run('codex',['--version'],{env})).stdout),['--version'])
})
