const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto')
const {snapshotAuthorJournals,verifyAuthorJournal}=require('../dist/helix-journal.js')

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'swegen-journal-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const task=path.join(root,'task'),journals=path.join(root,'journals'),journal=path.join(journals,'fixture')
 await fs.mkdir(task);await fs.mkdir(journal,{recursive:true})
 async function write({directory=task,complete=true,pending=null,digest,append=false,recordedAt=Math.floor(Date.now()/1000),thread='fixture-thread'}={}){
  const file=path.join(journal,'events.jsonl')
  const records=[{helix_event:'capture_started',recorded_at:recordedAt,session_id:'fixture-session'},
   {method:'thread/started',params:{thread:{id:thread}}},
   {helix_event:'capture_ended',recorded_at:recordedAt,complete}]
  const prior=append?await fs.readFile(file).catch(()=>Buffer.alloc(0)):Buffer.alloc(0)
  const data=Buffer.concat([prior,Buffer.from(records.map(JSON.stringify).join('\n')+'\n')])
  await fs.writeFile(file,data)
  await fs.writeFile(path.join(journal,'session.json'),JSON.stringify({id:'fixture-session',directory,thread_id:thread,
   uploaded_digest:digest===undefined?crypto.createHash('sha256').update(data).digest('hex'):digest,pending_snapshot:pending}))
 }
 return {root,task,journal,roots:[journals],write}
}

test('fresh uploaded capture is verified independently of any console text',async t=>{
 const f=await fixture(t),baseline=await snapshotAuthorJournals(f.task,f.roots)
 await f.write();const proof=await verifyAuthorJournal(f.task,baseline,f.roots)
 assert.equal(proof.saved,true);assert.equal(proof.journal,f.journal)
})
test('an earlier uploaded capture cannot certify a new author segment; resumed append can',async t=>{
 const f=await fixture(t);await f.write()
 const baseline=await snapshotAuthorJournals(f.task,f.roots)
 assert.equal((await verifyAuthorJournal(f.task,baseline,f.roots)).saved,false)
 await f.write({append:true})
 assert.equal((await verifyAuthorJournal(f.task,baseline,f.roots)).saved,true)
})
for(const [name,options] of [
 ['missing upload receipt',{digest:null}],['mismatched upload digest',{digest:'0'.repeat(64)}],
 ['pending upload',{pending:{path:'waiting'}}],['incomplete capture',{complete:false}],
 ['missing thread',{thread:''}],['old capture discovered after launch',{recordedAt:1}],
])test(`${name} does not certify a trace`,async t=>{
 const f=await fixture(t),baseline=await snapshotAuthorJournals(f.task,f.roots)
 await f.write(options)
 assert.equal((await verifyAuthorJournal(f.task,baseline,f.roots)).saved,false)
})
test('a receipt for another task is rejected even when its digest matches',async t=>{
 const f=await fixture(t),other=path.join(f.root,'other');await fs.mkdir(other)
 const baseline=await snapshotAuthorJournals(f.task,f.roots);await f.write({directory:other})
 assert.equal((await verifyAuthorJournal(f.task,baseline,f.roots)).saved,false)
})
test('upload recovery is recognized on recheck without new sessions or console markers',async t=>{
 const f=await fixture(t),baseline=await snapshotAuthorJournals(f.task,f.roots)
 await f.write({digest:null,pending:{path:'waiting'}})
 assert.equal((await verifyAuthorJournal(f.task,baseline,f.roots)).saved,false)
 const file=path.join(f.journal,'session.json'),s=JSON.parse(await fs.readFile(file,'utf8'))
 s.pending_snapshot=null;s.uploaded_digest=crypto.createHash('sha256').update(await fs.readFile(path.join(f.journal,'events.jsonl'))).digest('hex')
 await fs.writeFile(file,JSON.stringify(s))
 assert.equal((await verifyAuthorJournal(f.task,baseline,f.roots)).saved,true)
})
test('rewriting earlier journal history is rejected even with an updated receipt',async t=>{
 const f=await fixture(t);await f.write()
 const baseline=await snapshotAuthorJournals(f.task,f.roots)
 await f.write({append:false,thread:'different-thread-with-longer-content'})
 assert.equal((await verifyAuthorJournal(f.task,baseline,f.roots)).saved,false)
})
