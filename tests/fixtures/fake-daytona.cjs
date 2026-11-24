// Isolated filesystem/process backend. Never imports the real Daytona client.
const Module=require('node:module'),fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),{execFile,spawn}=require('node:child_process')
const original=Module._load
const root=process.env.FIXTURE_ROOT
const event=x=>fs.appendFileSync(path.join(root,'events.jsonl'),JSON.stringify(x)+'\n')
const mapped=x=>x.replace(/(\/var\/lib\/docker|\/home\/daytona|\/opt|\/root|\/output)(?=\/|['"\s]|$)/g,prefix=>root+'/remote'+prefix)
const jobs=new Map()
const sandbox={id:'00000000-0000-4000-8000-000000000001',
 fs:{
  async uploadFile(source,destination){
   let data=Buffer.isBuffer(source)?source:await fsp.readFile(source)
   if(destination.endsWith('runtime-assets-manifest.json')||destination.endsWith('capture-browser-receipt.json')) data=Buffer.from(mapped(data.toString()))
   if(destination.endsWith('collect_review_logs.py')) data=Buffer.from(mapped(data.toString()))
   const file=mapped(destination);await fsp.mkdir(path.dirname(file),{recursive:true});await fsp.writeFile(file,data)
  },
  async uploadFiles(files){for(const f of files)await this.uploadFile(f.source,f.destination)},
  async downloadFile(remote,local){
   const data=await fsp.readFile(mapped(remote));event({kind:'download',remote})
   if(typeof local==='string'){await fsp.writeFile(local,data);return}
   return data
  }
 },
 process:{
  async executeCommand(command,cwd){
   event({kind:'remote-command',command})
   if(command.includes('/probe_preflight.py'))return {exitCode:process.env.FIXTURE_AUTH_FAIL==='yes'?1:0,result:'fixture live preflight (no network)'}
   if(command.includes('subscription_login_present'))return {exitCode:fs.existsSync(mapped('/root/.codex/auth.json'))?0:1,result:'fixture subscription preflight (no network)'}
   if(command.includes('urllib.request'))return {exitCode:process.env.FIXTURE_PROVIDER_AUTH_FAIL==='yes'?1:0,result:'fixture provider preflight (no network)'}
   if(command==='rv mode codex')return {exitCode:process.env.FIXTURE_RV_MODE_FAIL!=='yes'&&fs.existsSync(mapped('/root/.codex/auth.json'))?0:1,result:'fixture official Codex mode (no network)'}
   return new Promise(resolve=>execFile('bash',['-c',mapped(command)],{cwd:cwd?mapped(cwd):root,env:{...process.env,HOME:root+'/remote/root',FIXTURE_REMOTE:'yes'},maxBuffer:8*1024*1024},(error,stdout,stderr)=>resolve({exitCode:error?Number(error.code)||1:0,result:stdout+stderr})))
  },
  async createSession(id){event({kind:'session',id})},
  async executeSessionCommand(session,request){
   const child=spawn('bash',['-c',mapped(request.command)],{env:{...process.env,HOME:root+'/remote/root',FIXTURE_REMOTE:'yes'},stdio:'ignore'})
   const state={exitCode:undefined};jobs.set(session,state);child.on('exit',code=>{state.exitCode=code??1})
   return {cmdId:session}
  },
  async getSessionCommand(session){return jobs.get(session)},
 },
 async delete(){event({kind:'delete'})},async stop(){event({kind:'stop'})},async setTtl(){},async setAutoDeleteInterval(){}
}
class FakeDaytona{async create(){event({kind:'create'});return sandbox}}
Module._load=function(name,...rest){if(name==='@daytona/sdk')return {Daytona:FakeDaytona};return original.call(this,name,...rest)}
