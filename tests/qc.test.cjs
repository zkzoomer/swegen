const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path')
const {assessQc}=require('../dist/qc.js')
const {waitFor,waitSeconds}=require('../dist/wait.js')

async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'swegen-qc-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 const staging=path.join(root,'staging'),task=path.join(root,'task'),results=path.join(staging,'qc-results')
 await fs.mkdir(results,{recursive:true});await fs.mkdir(task)
 const batches=[]
 for(const [lane,checks,ids] of [
  ['preflight',['preflight'],['template-compatible']],
  ['judgment',['judgment'],['swemultimodal/tests-observable']],
  ...['gameability','altsolve','leakage','media-ablation'].map(p=>[p,['swemultimodal/probe-'+p],['swemultimodal/probe-'+p]])
 ]){
  const result=lane+'-initial.json'
  await fs.writeFile(path.join(results,result),JSON.stringify({records:ids.map(check_id=>({check_id,status:'completed',output:{outcome:'passed',flagged:false}}))}))
  batches.push({status:'finished',checks,lanes:[{result,checks}]})
 }
 const ledger={initial_judgment:1,batches}
 await fs.writeFile(path.join(results,'ledger.json'),JSON.stringify(ledger))
 return {staging,task,results,ledger}
}
test('QC requires all probes, judgment and static preflight, independently of oracle',async t=>{
 const {staging,task,results}=await fixture(t)
 assert.equal((await assessQc(staging,task)).status,'passed')
 await fs.writeFile(path.join(results,'gameability-initial.json'),JSON.stringify({records:[{check_id:'swemultimodal/probe-gameability',status:'completed',output:{outcome:'failed',flagged:true}}]}))
 assert.equal((await assessQc(staging,task)).status,'incomplete')
})
test('evidenced disputes remain review-required and cannot waive execution errors',async t=>{
 const {staging,task,results}=await fixture(t),check='swemultimodal/probe-gameability'
 const file=path.join(results,'gameability-initial.json')
 await fs.writeFile(file,JSON.stringify({records:[{check_id:check,status:'completed',output:{outcome:'failed'}}]}))
 await fs.writeFile(path.join(task,'disputes.md'),check+'\nA contract-backed scope dispute.')
 await fs.writeFile(path.join(staging,'evidence.txt'),'Candidate produces the required public behavior.')
 const disputes=[{check_id:check,reason:'Excluded behavior',evidence:['evidence.txt']}]
 const state=await assessQc(staging,task,disputes)
 assert.equal(state.status,'review_required')
 await fs.writeFile(path.join(staging,'evidence.txt'),'Evidence changed')
 assert.notEqual((await assessQc(staging,task,disputes)).evidence,state.evidence)
 await fs.writeFile(file,JSON.stringify({records:[{check_id:check,status:'error',error:'expired login'}]}))
 assert.equal((await assessQc(staging,task,disputes)).status,'incomplete')
})
test('only newer observed results resolve an older failed check',async t=>{
 const {staging,task,results,ledger}=await fixture(t)
 const result='gameability-final-rerun1.json',checks=['swemultimodal/probe-gameability']
 await fs.writeFile(path.join(results,'gameability-initial.json'),JSON.stringify({records:[{check_id:checks[0],status:'error',error:'expired login'}]}))
 assert.equal((await assessQc(staging,task)).status,'incomplete')
 await fs.writeFile(path.join(results,result),JSON.stringify({records:[{check_id:checks[0],status:'completed',output:{outcome:'passed'}}]}))
 ledger.batches.push({status:'finished',checks,lanes:[{result,checks}]})
 await fs.writeFile(path.join(results,'ledger.json'),JSON.stringify(ledger))
 assert.equal((await assessQc(staging,task)).status,'passed')
})
test('bounded waits return completion promptly and never accept an unbounded timeout',async()=>{
 let count=0
 const value=await waitFor(async()=>++count,n=>n===1,.01)
 assert.equal(value,1)
 for(const bad of ['-1','56','NaN','Infinity'])assert.throws(()=>waitSeconds(bad),/0 and 55/)
 assert.equal(waitSeconds('0'),0)
})

test('failed checksum collection cannot leave reusable evidence behind',async t=>{
 const {ComputeWorker}=require('../dist/worker.js'),{createHash}=require('node:crypto')
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'swegen-fetch-'));t.after(()=>fs.rm(root,{recursive:true,force:true}))
 let corrupt=true
 const expected=createHash('sha256').update('verified evidence').digest('hex')
 const sandbox={process:{executeCommand:async()=>({exitCode:0,result:expected+'  result.json'})},fs:{downloadFile:async(remote,local)=>fs.writeFile(local,corrupt?'corrupted evidence':'verified evidence')}}
 const worker=new ComputeWorker(sandbox,root,root,root),local=path.join(root,'result.json')
 await assert.rejects(worker.fetch('/output/result.json',local),/checksum/)
 await assert.rejects(fs.access(local))
 corrupt=false
 assert.equal((await worker.fetch('/output/result.json',local)).sha256,expected)
 assert.equal(await fs.readFile(local,'utf8'),'verified evidence')
})
