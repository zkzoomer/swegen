const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util')
const exec=promisify(execFile)
async function fixture(t,mutate=false,qc='passed',authFail=false,dryRun=false,browserFail=false,settings={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'swegen-local-launcher-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 await fs.writeFile(path.join(root,'events.jsonl'),'')
 const project=path.join(root,'project'),bin=path.join(root,'bin'),task=path.join(root,'linked-task'),kit=path.join(root,'private-kit')
 for(const dir of [project,bin,task,kit,path.join(root,'remote/home/daytona/workspace'),path.join(project,'agent/node_modules/.bin')])await fs.mkdir(dir,{recursive:true})
 const repo=path.resolve(__dirname,'..')
 for(const name of ['dist','scripts'])await fs.cp(path.join(repo,name),path.join(project,name),{recursive:true})
 await fs.mkdir(path.join(project,'agent'),{recursive:true});await fs.copyFile(path.join(repo,'agent/logging.cjs'),path.join(project,'agent/logging.cjs'))
 await fs.symlink(path.join(repo,'node_modules'),path.join(project,'node_modules'))
 for(const name of ['JOB.template.md','AGENTS.md'])await fs.copyFile(path.join(repo,name),path.join(project,name))
 const skill=path.join(project,'skills/swe-multimodal-task-author');await fs.mkdir(skill,{recursive:true});await fs.writeFile(path.join(skill,'SKILL.md'),'fixture skill')
 for(const name of ['README.md','build_media_task.py','capturekit/README.md','capturekit/capturekit.py','capturekit/ghost_path.js','scripts/audit_cmds.py']){const file=path.join(kit,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'fixture kit playwright==1.48.0\n')}
 await fs.writeFile(path.join(project,'scripts/audit_handoff.py'),"print('{\"status\":\"ok\"}')\n")
 await fs.writeFile(path.join(task,'task.toml'),'fixture=true\n')
 if(settings.briefOnly||settings.extraBrief!==undefined)await fs.writeFile(path.join(root,'assignment.md'),settings.extraBrief??'Transport-only fixture assignment.')
 await fs.copyFile(path.join(__dirname,'fixtures/local-outer.cjs'),path.join(project,'agent/node_modules/.bin/tsx'));await fs.chmod(path.join(project,'agent/node_modules/.bin/tsx'),0o755)
 const fakeHelix=`#!/usr/bin/env python3
import sys,os,json,pathlib,tty,zipfile,hashlib,time
root=pathlib.Path(os.environ['FIXTURE_ROOT']);args=sys.argv[1:]
with (root/'events.jsonl').open('a') as f:f.write(json.dumps({'kind':'helix','args':args,'cwd':os.getcwd(),'remote':os.environ.get('FIXTURE_REMOTE')})+'\\n')
if args[:2]==['task','author']:
 tty.setraw(0);print('\\x1b[2J\\x1b[HREADY\\r\\n>_ OpenAI Codex (fixture)\\r\\n› Ask Codex to do anything',flush=True);pending=b''
 while True:
  pending+=os.read(0,65536)
  if b'\\r' not in pending:continue
  line,pending=pending.split(b'\\r',1)
  if b'/quit' in line:
   j=pathlib.Path.home()/'.micro1-helix/journal/author/fixture-session';j.mkdir(parents=True,exist_ok=True)
   data=(json.dumps({'helix_event':'capture_started','recorded_at':int(time.time()),'session_id':'fixture-session'})+'\\n'+json.dumps({'helix_event':'capture_ended','recorded_at':int(time.time()),'complete':True})+'\\n').encode()
   (j/'events.jsonl').write_bytes(data)
   (j/'session.json').write_text(json.dumps({'id':'fixture-session','directory':os.getcwd(),'thread_id':'fixture-thread','pending_snapshot':None,'uploaded_digest':hashlib.sha256(data).hexdigest()}))
   print('\\r\\nDisconnected from this task. Any running work continues.\\r\\n',flush=True);break
  (pathlib.Path.cwd()/'instruction.md').write_text('fixture authored content')
  print('\\r\\nDONE\\r\\n',flush=True)
elif args[:2]==['task','download']:print(json.dumps({'ok':True,'data':{'directory':str(root/'linked-task')}}))
elif args[:2]==['task','status']:print(json.dumps({'ok':True,'data':{'task_id':'fixture-task'}}))
elif args[:2]==['task','oracle']:print(json.dumps({'ok':True,'data':{'reward':1.0}}))
elif args[:2]==['task','zip']:
 destination=args[args.index('--destination')+1]
 with zipfile.ZipFile(destination,'x') as z:
  for p in pathlib.Path.cwd().rglob('*'):
   if p.is_file():z.write(p,p.relative_to(pathlib.Path.cwd()))
 print(destination)
else:print(json.dumps({'ok':True}))
`
 await fs.writeFile(path.join(bin,'helix'),fakeHelix,{mode:0o755})
 for(const name of ['uv','rv','codex'])await fs.writeFile(path.join(bin,name),'#!/bin/sh\nprintf "fixture tool ready\\n"\n',{mode:0o755})
 await fs.writeFile(path.join(bin,'docker'),`#!/usr/bin/env python3
import sys,os,json,hashlib,tarfile,io
args=sys.argv[1:]
if args and args[0]=='build' and os.environ.get('FIXTURE_BROWSER_FAIL')=='yes':sys.exit(7)
config=json.dumps({'architecture':'amd64','os':'linux','rootfs':{'diff_ids':['sha256:'+'c'*64]}}).encode()
config_id='sha256:'+hashlib.sha256(config).hexdigest()
if args[:2]==['image','inspect']:
 print(json.dumps({'Id':config_id,'Architecture':'amd64','Os':'linux','RootFS':{'Layers':['sha256:'+'c'*64]}}) if '{{json .}}' in args else config_id)
elif args and args[0]=='save':
 data={'manifest.json':json.dumps([{'Config':'config.json','RepoTags':['swegen-capture-browsers:pw1.48.0-b4bedaaee2a9']}]).encode(),'config.json':config}
 with tarfile.open(fileobj=sys.stdout.buffer,mode='w|') as tar:
  for name,content in data.items():
   info=tarfile.TarInfo(name);info.size=len(content);tar.addfile(info,io.BytesIO(content))
else:print('fixture docker ready')
`,{mode:0o755})
 const env={...process.env,HOME:path.join(root,'local-home'),PATH:bin+path.delimiter+process.env.PATH,FIXTURE_ROOT:root,FIXTURE_MUTATE:mutate?'yes':'no',FIXTURE_QC:qc,FIXTURE_AUTH_FAIL:authFail?'yes':'no',FIXTURE_BROWSER_FAIL:browserFail?'yes':'no',NODE_OPTIONS:'--require '+path.join(__dirname,'fixtures/fake-daytona.cjs'),DAYTONA_API_KEY:'fixture-key',DAYTONA_SNAPSHOT:'fixture-snapshot',MEDIA_CAPTURE_KIT_DIR:kit,OPENROUTER_API_KEY:'fixture-provider-key-123456789',CODEX_MODEL:'fixture-model',CODEX_REASONING_EFFORT:'medium'}
 // Isolate provider selection from the operator's environment and auth files.
 env.SWEGEN_RV_MODE=settings.rvMode
 env.RV_AUTH_PATH=path.join(root,'rv-auth.json')
 if(settings.openrouterKey===false)env.OPENROUTER_API_KEY=undefined
 if(settings.rvAuthFile)await fs.writeFile(env.RV_AUTH_PATH,settings.rvAuthFile==='invalid'?'invalid fixture JSON':JSON.stringify({openrouter_api_key:'fixture-file-key-123456789'}))
 env.FIXTURE_PROVIDER_AUTH_FAIL=settings.providerAuthFail?'yes':'no'
 env.FIXTURE_RV_MODE_FAIL=settings.modeFail?'yes':'no'
 await fs.mkdir(path.join(env.HOME,'.codex'),{recursive:true})
 await fs.writeFile(path.join(env.HOME,'.codex/auth.json'),JSON.stringify(settings.codexLogin===false?{}:{tokens:{access_token:'fixture-codex-login'}}))
 env.CODEX_HOME=path.join(env.HOME,'.codex')
 const args=[path.join(project,'dist/index.js'),'--task-url','https://helix.micro1.ai/pipelines/p/tasks?task_id=fixture-task','--output-dir',path.join(root,'outputs')]
 if(!settings.briefOnly)args.push('--pr',settings.prUrl??'https://github.com/owner/repository/pull/123')
 if(settings.briefOnly||settings.extraBrief!==undefined)args.push('--brief-file',path.join(root,'assignment.md'))
 if(dryRun)args.push('--dry-run')
 let result
 try{const r=await exec(process.execPath,args,{cwd:project,env,timeout:20000,maxBuffer:2*1024*1024});result={...r,code:0}}catch(e){result={stdout:e.stdout||'',stderr:e.stderr||'',code:e.code}}
 const events=(await fs.readFile(path.join(root,'events.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)
 return {root,task,result,events}
}
test('whole local launcher records authoring, runs oracle locally, downloads logs then deletes compute',async t=>{
 const {root,task,result,events}=await fixture(t)
 assert.equal(result.code,0,result.stdout+'\n'+result.stderr)
 assert.match(result.stdout,/\$ helix doctor --output json/)
 assert.match(result.stdout,/\[inner\] \$ helix task author/)
 assert.doesNotMatch(result.stdout,/^fixture tool ready$|^\{"ok":true\}$|^remote check done$|Full text evidence/m)
 const helix=events.filter(x=>x.kind==='helix')
 assert.ok(helix.some(x=>x.args[1]==='author'))
 assert.equal(helix.filter(x=>x.args[1]==='oracle'&&x.cwd===task).length,1)
 assert.ok(helix.every(x=>!x.remote),'No Helix command may run in Daytona')
 assert.equal(events.filter(x=>x.kind==='create').length,1)
 const provider=events.findIndex(x=>x.kind==='remote-command'&&x.command.includes('urllib.request'))
 const subscription=events.findIndex(x=>x.kind==='remote-command'&&x.command.includes('/probe_preflight.py'))
 const author=events.findIndex(x=>x.kind==='helix'&&x.args[1]==='author')
 assert.ok(provider>=0&&subscription>provider&&author>subscription,'Default mode must validate both credentials before authoring')
 assert.equal(events.some(x=>x.kind==='remote-command'&&x.command==='rv mode codex'),false)
 const removed=events.findIndex(x=>x.kind==='delete')
 assert.ok(removed>events.findLastIndex(x=>x.kind==='download'))
 assert.equal(events.some(x=>x.kind==='stop'),false)
 assert.ok((await fs.readdir(path.join(root,'outputs'))).some(x=>x.includes('handoff')&&x.endsWith('.zip')))
 await assert.rejects(fs.access(path.join(root,'assignment.md')),{code:'ENOENT'})
 const run=path.join(root,'outputs/logs',(await fs.readdir(path.join(root,'outputs/logs')))[0])
 assert.match(await fs.readFile(path.join(run,'JOB.md'),'utf8'),/Assigned PR: https:\/\/github.com\/owner\/repository\/pull\/123/)
})
test('PR launch preserves optional special instructions in the generated job',async t=>{
 const notes='Keep the fix in the assigned package. Do not launch hosted evaluations.'
 const {root,result}=await fixture(t,false,'passed',false,false,false,{extraBrief:notes})
 assert.equal(result.code,0,result.stdout+'\n'+result.stderr)
 const run=path.join(root,'outputs/logs',(await fs.readdir(path.join(root,'outputs/logs')))[0])
 const job=await fs.readFile(path.join(run,'JOB.md'),'utf8')
 assert.match(job,/Assigned PR: https:\/\/github.com\/owner\/repository\/pull\/123/)
 assert.ok(job.includes('Additional instructions:\n\n'+notes))
})
test('legacy brief-only launch remains supported',async t=>{
 const {root,result}=await fixture(t,false,'passed',false,false,false,{briefOnly:true})
 assert.equal(result.code,0,result.stdout+'\n'+result.stderr)
 const run=path.join(root,'outputs/logs',(await fs.readdir(path.join(root,'outputs/logs')))[0])
 const job=await fs.readFile(path.join(run,'JOB.md'),'utf8')
 assert.ok(job.includes('Transport-only fixture assignment.'))
 assert.doesNotMatch(job,/Assigned PR:/)
})
test('invalid PR is rejected before local Helix operations or worker creation',async t=>{
 const {result,events}=await fixture(t,false,'passed',false,false,false,{prUrl:'https://github.com/owner/repository/issues/123'})
 assert.notEqual(result.code,0)
 assert.match(result.stderr,/--pr must be an HTTPS GitHub pull request URL/)
 assert.deepEqual(events,[])
})
test('post-oracle task change cannot produce a completed handoff or delete evidence',async t=>{
 const {root,result,events}=await fixture(t,true)
 assert.notEqual(result.code,0)
 assert.match(result.stderr,/final unchanged task|final LOCAL|final local|unchanged task|final.*oracle/i)
 assert.equal(events.some(x=>x.kind==='delete'),false)
 assert.equal(events.some(x=>x.kind==='stop'),true)
 assert.ok((await fs.readdir(path.join(root,'outputs'))).some(x=>x.includes('recovery-handoff')))
})

test('a passing oracle cannot hide unresolved QC or delete its recovery worker',async t=>{
 const {root,result,events}=await fixture(t,false,'unresolved')
 assert.notEqual(result.code,0)
 assert.match(result.stderr,/QC incomplete/)
 assert.equal(events.some(x=>x.kind==='delete'),false)
 assert.equal(events.some(x=>x.kind==='stop'),true)
 assert.ok((await fs.readdir(path.join(root,'outputs'))).some(x=>x.includes('recovery-handoff')))
})
test('an evidenced dispute produces a review handoff without claiming QC passed',async t=>{
 const {root,result}=await fixture(t,false,'disputed')
 assert.equal(result.code,0,result.stdout+'\n'+result.stderr)
 assert.match(result.stdout,/Review handoff packaged/)
 assert.doesNotMatch(result.stdout,/QC passed/)
 assert.ok((await fs.readdir(path.join(root,'outputs'))).some(x=>x.includes('review-handoff')))
})
test('live subscription preflight fails before either task agent starts',async t=>{
 const {result,events}=await fixture(t,false,'passed',true)
 assert.notEqual(result.code,0)
 assert.equal(events.some(x=>x.kind==='helix'&&x.args[1]==='author'),false)
 assert.equal(events.some(x=>x.kind==='delete'),false)
 assert.equal(events.some(x=>x.kind==='stop'),true)
})

test('compute-only dry run never claims task completion or a QC pass',async t=>{
 const {result,events}=await fixture(t,false,'passed',false,true)
 assert.equal(result.code,0,result.stdout+'\n'+result.stderr)
 assert.match(result.stdout,/no task agents or QC ran/)
 assert.doesNotMatch(result.stdout,/QC passed|Handoff packaged/)
 assert.equal(events.some(x=>x.kind==='helix'),false)
})
test('missing browser bundle fails before creating any billed worker or task agent',async t=>{
 const {result,events}=await fixture(t,false,'passed',false,false,true)
 assert.notEqual(result.code,0)
 assert.match(result.stderr,/browser preparation failed before worker creation/i)
 assert.equal(events.some(x=>x.kind==='create'),false)
 assert.equal(events.some(x=>x.kind==='helix'&&x.args[1]==='author'),false)
})


test('default OpenRouter mode still reads and validates the configured rv auth file',async t=>{
 const {root,result,events}=await fixture(t,false,'passed',false,false,false,{openrouterKey:false,rvAuthFile:true})
 assert.equal(result.code,0,result.stdout+'\n'+result.stderr)
 const remote=JSON.parse(await fs.readFile(path.join(root,'remote/root/.rv/auth.json'),'utf8'))
 assert.equal(remote.openrouter_api_key,'fixture-file-key-123456789')
 assert.ok(events.some(x=>x.kind==='remote-command'&&x.command==='rv mode openrouter'))
 assert.ok(events.some(x=>x.kind==='remote-command'&&x.command.includes('https://openrouter.ai/api/v1/key')))
})

test('Codex mode needs no OpenRouter key or auth file and selects official mode after live login validation',async t=>{
 const {root,result,events}=await fixture(t,false,'passed',false,false,false,{rvMode:'codex',openrouterKey:false})
 assert.equal(result.code,0,result.stdout+'\n'+result.stderr)
 await assert.rejects(fs.access(path.join(root,'rv-auth.json')),{code:'ENOENT'})
 await assert.rejects(fs.access(path.join(root,'remote/root/.rv/auth.json')),{code:'ENOENT'})
 const subscription=events.findIndex(x=>x.kind==='remote-command'&&x.command.includes('/probe_preflight.py'))
 const mode=events.findIndex(x=>x.kind==='remote-command'&&x.command==='rv mode codex')
 const author=events.findIndex(x=>x.kind==='helix'&&x.args[1]==='author')
 assert.ok(subscription>=0&&mode>subscription&&author>mode,'Mode selection must follow real subscription preflight and precede agents')
 assert.equal(events.some(x=>x.kind==='remote-command'&&(x.command==='rv mode openrouter'||x.command.includes('urllib.request'))),false)
})

test('Codex mode ignores unusable OpenRouter credentials rather than validating or transferring them',async t=>{
 const {root,result,events}=await fixture(t,false,'passed',false,false,false,{rvMode:'codex',rvAuthFile:'invalid',providerAuthFail:true})
 assert.equal(result.code,0,result.stdout+'\n'+result.stderr)
 await assert.rejects(fs.access(path.join(root,'remote/root/.rv/auth.json')),{code:'ENOENT'})
 assert.equal(events.some(x=>x.kind==='remote-command'&&x.command.includes('urllib.request')),false)
})

test('Codex mode rejects a failed live subscription before mode selection, agents or QC',async t=>{
 const {result,events}=await fixture(t,false,'passed',true,false,false,{rvMode:'codex',openrouterKey:false})
 assert.notEqual(result.code,0)
 assert.ok(events.some(x=>x.kind==='remote-command'&&x.command.includes('/probe_preflight.py')))
 assert.equal(events.some(x=>x.kind==='remote-command'&&x.command==='rv mode codex'),false)
 assert.equal(events.some(x=>x.kind==='helix'&&x.args[1]==='author'),false)
 assert.equal(events.some(x=>x.kind==='session'),false)
 assert.equal(events.some(x=>x.kind==='stop'),true)
})

test('Codex mode rejects an invalid login file without falling back to an OpenRouter key',async t=>{
 const {result,events}=await fixture(t,false,'passed',false,false,false,{rvMode:'codex',codexLogin:false})
 assert.notEqual(result.code,0)
 assert.match(result.stderr,/Codex probe login is missing/)
 assert.equal(events.some(x=>x.kind==='remote-command'&&x.command.includes('urllib.request')),false)
 assert.equal(events.some(x=>x.kind==='helix'&&x.args[1]==='author'),false)
 assert.equal(events.some(x=>x.kind==='session'),false)
 assert.equal(events.some(x=>x.kind==='stop'),true)
})

test('failure to select official Codex mode stops startup after authenticated preflight',async t=>{
 const {result,events}=await fixture(t,false,'passed',false,false,false,{rvMode:'codex',openrouterKey:false,modeFail:true})
 assert.notEqual(result.code,0)
 assert.match(result.stderr,/rv mode codex/)
 assert.ok(events.some(x=>x.kind==='remote-command'&&x.command.includes('/probe_preflight.py')))
 assert.equal(events.some(x=>x.kind==='helix'&&x.args[1]==='author'),false)
 assert.equal(events.some(x=>x.kind==='stop'),true)
})

test('unsupported rv mode is rejected before any worker or local task operation',async t=>{
 const {result,events}=await fixture(t,false,'passed',false,false,false,{rvMode:'unsupported',openrouterKey:false})
 assert.notEqual(result.code,0)
 assert.match(result.stderr,/SWEGEN_RV_MODE must be openrouter or codex/)
 assert.deepEqual(events,[])
})

test('Codex-mode dry run remains auth-free and transport-only',async t=>{
 const {result,events}=await fixture(t,false,'passed',false,true,false,{rvMode:'codex',openrouterKey:false,codexLogin:false})
 assert.equal(result.code,0,result.stdout+'\n'+result.stderr)
 assert.match(result.stdout,/no task agents or QC ran/)
 assert.equal(events.some(x=>x.kind==='remote-command'&&(/rv mode |subscription_login_present|probe_preflight.py|urllib.request/).test(x.command)),false)
 assert.equal(events.some(x=>x.kind==='helix'),false)
})

test('default OpenRouter mode still rejects failed provider authentication before agents',async t=>{
 const {result,events}=await fixture(t,false,'passed',false,false,false,{providerAuthFail:true})
 assert.notEqual(result.code,0)
 assert.ok(events.some(x=>x.kind==='remote-command'&&x.command.includes('urllib.request')))
 assert.equal(events.some(x=>x.kind==='remote-command'&&x.command.includes('/probe_preflight.py')),false)
 assert.equal(events.some(x=>x.kind==='helix'&&x.args[1]==='author'),false)
 assert.equal(events.some(x=>x.kind==='stop'),true)
})
