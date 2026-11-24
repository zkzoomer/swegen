const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto')
const {execFile}=require('node:child_process'),{promisify}=require('node:util')
const execute=promisify(execFile)
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sw-note-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const logs=path.join(root,'logs'),staging=path.join(logs,'author-staging'),workspace=path.join(logs,'outer-workspace'),socket=path.join(root,'rpc.sock')
 await fs.mkdir(staging,{recursive:true});await fs.mkdir(workspace)
 const context=path.join(root,'context.json');await fs.writeFile(context,JSON.stringify({logs,staging,socket}))
 const server=http.createServer((req,res)=>{req.resume();req.on('end',()=>res.end(JSON.stringify({ok:true,result:{unchanged:true}})))})
 await new Promise(resolve=>server.listen(socket,resolve));t.after(()=>new Promise(resolve=>server.close(resolve)))
 const call=async outer=>execute(process.execPath,[path.resolve(__dirname,'../dist/bridge-client.js'),'inner-read'],{env:{...process.env,SWEGEN_CONTEXT_PATH:context,SWEGEN_OUTER_WORKSPACE:outer===undefined?workspace:outer}})
 return {root,staging,workspace,call,note:path.join(staging,'coordinator-inbox.md'),ack:path.join(staging,'coordinator-inbox.ack')}
}
test('outer receives task-scoped updates without changing RPC JSON; acknowledgement is explicit and hash-specific',async t=>{
 const f=await fixture(t)
 let r=await f.call();assert.deepEqual(JSON.parse(r.stdout),{unchanged:true});assert.equal(r.stderr,'')
 const text='Keep the four reviewed clips; preserve the recorded authoring flow.'
 await fs.writeFile(f.note,text)
 r=await f.call();assert.deepEqual(JSON.parse(r.stdout),{unchanged:true});assert.match(r.stderr,/Keep the four reviewed clips/)
 await assert.rejects(fs.access(f.ack),e=>e.code==='ENOENT')
 const digest=crypto.createHash('sha256').update(text).digest('hex');await fs.writeFile(f.ack,digest+'\n')
 r=await f.call();assert.equal(r.stderr,'')
 await fs.appendFile(f.note,' New evidence available.')
 r=await f.call();assert.match(r.stderr,/New evidence available/)
})
test('notices are bounded regular files and are not delivered to root or a different task outer',async t=>{
 const f=await fixture(t);await fs.writeFile(f.note,'Only this task outer should see this.')
 assert.equal((await f.call('')).stderr,'');assert.equal((await f.call(path.join(f.root,'other-outer'))).stderr,'')
 await fs.writeFile(f.note,'x'.repeat(12001));assert.equal((await f.call()).stderr,'')
 await fs.unlink(f.note);const target=path.join(f.root,'outside.md');await fs.writeFile(target,'not delivered');await fs.symlink(target,f.note)
 assert.equal((await f.call()).stderr,'')
})
