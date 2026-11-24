const {test} = require('node:test')
const assert = require('node:assert/strict')
const {parseArgs,renderJobText} = require('../dist/job.js')
const url='https://helix.micro1.ai/pipelines/p/tasks?task_id=t'

test('assigned Helix URL and brief replace advisory and invented task IDs',()=>{
 const result=parseArgs(['--task-url',url,'--brief-file','assignment.md'])
 assert.equal(result.taskUrl,url)
 assert.ok(result.briefFile.endsWith('/assignment.md'))
 assert.equal(result.dryRun,false)
 assert.throws(()=>parseArgs(['--advisory','https://example.com']),/unknown argument/)
 assert.throws(()=>parseArgs(['--task-url',url,'--brief-file','assignment.md','--task-id','1']),/unknown argument/)
})
test('reject incomplete or non-Helix job input before starting a worker',()=>{
 assert.throws(()=>parseArgs([]),/task-url is required/)
 assert.throws(()=>parseArgs(['--task-url',url]),/brief-file is required/)
 for(const bad of ['http://helix.micro1.ai/tasks','https://example.com/tasks','https://name:password@helix.micro1.ai/tasks']){
  assert.throws(()=>parseArgs(['--task-url',bad,'--brief-file','assignment.md']),/HTTPS Helix/)
 }
 assert.throws(()=>parseArgs(['--auth-smoke','--dry-run']),/mutually exclusive/)
})
test('auth smoke is standalone; dry runs still carry the real assignment',()=>{
 assert.equal(parseArgs(['--auth-smoke']).authSmoke,true)
 assert.equal(parseArgs(['--task-url='+url,'--brief-file=brief.md','--dry-run']).dryRun,true)
})
test('render only controlled template tokens; do not reinterpret supplied brief',()=>{
 const options=parseArgs(['--task-url',url,'--brief-file','brief.md'])
 const brief='Keep scope. Literal {{TASK_URL}} is part of this assignment.'
 assert.equal(renderJobText('Task {{TASK_URL}}\n{{TASK_BRIEF}}',options,brief),`Task ${url}\n${brief}\n`)
 assert.throws(()=>renderJobText('{{UNKNOWN}}',options,'text'),/unknown job template/)
 assert.throws(()=>renderJobText('{{TASK_BRIEF}}',options,' '),/brief is empty/)
})
test('CLI help and rejected old options never require credentials or a worker',()=>{
 const {spawnSync}=require('node:child_process')
 const path=require('node:path')
 const script=path.join(__dirname,'../dist/index.js')
 const env={...process.env,DAYTONA_API_KEY:'',DAYTONA_SNAPSHOT:''}
 const help=spawnSync(process.execPath,[script,'--help'],{encoding:'utf8',env})
 assert.equal(help.status,0,help.stderr)
 assert.match(help.stdout,/--task-url/)
 assert.doesNotMatch(help.stdout,/--advisory/)
 const invalid=spawnSync(process.execPath,[script,'--advisory','https://example.test'],{encoding:'utf8',env})
 assert.notEqual(invalid.status,0)
 assert.match(invalid.stderr,/unknown argument/)
})
test('worker shell arguments preserve quotes and metacharacters literally',()=>{
 const {execFileSync}=require('node:child_process')
 const {quoteShell}=require('../dist/utils.js')
 const value="fixture'with space; $(do-not-execute) $variable"
 assert.equal(execFileSync('bash',['-c',"printf '%s' "+quoteShell(value)],{encoding:'utf8'}),value)
})
