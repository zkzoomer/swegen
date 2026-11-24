const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
const {execFile}=require('node:child_process'),{promisify}=require('node:util')
const run=promisify(execFile),{helixLaunchEnvironment}=require('../dist/helix-launch.js')
test('controller and inherited agent PATH use the same Helix gate without changing the original environment',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"swegen helix's gate-"));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const bin=path.join(root,'real bin');await fs.mkdir(bin)
 await fs.writeFile(path.join(bin,'helix'),'#!/usr/bin/env node\nconsole.log(JSON.stringify({args:process.argv.slice(2),home:process.env.HOME,active:process.env.SWEGEN_HELIX_ACTIVE}))\n',{mode:0o700})
 const original={...process.env,HOME:root,PATH:bin+path.delimiter+process.env.PATH}
 const environment=await helixLaunchEnvironment(path.join(root,'job/bin'),path.resolve(__dirname,'../scripts/helix_gate.py'),original)
 for(const args of [['task','status','--output','json'],['task','author']]){
  const value=JSON.parse((await run('helix',args,{env:environment})).stdout)
  assert.deepEqual(value.args,args);assert.equal(value.home,root)
  assert.equal(value.active,args[1]==='author'?'author':undefined)
 }
 assert.equal(original.PATH,bin+path.delimiter+process.env.PATH)
 assert.equal(environment.SWEGEN_HELIX_GATE_LOCK,path.join(root,'.cache/swegen/helix.lock'))
 assert.equal((await fs.stat(path.join(root,'job/bin/helix'))).mode&0o777,0o700)
})
