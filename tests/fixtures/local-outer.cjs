#!/usr/bin/env node
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path')
;(async()=>{
 const c=JSON.parse(await fs.readFile(process.env.SWEGEN_CONTEXT_PATH,'utf8'))
 async function action(action,args={}){return new Promise((resolve,reject)=>{
  const req=http.request({socketPath:c.socket,path:'/action',method:'POST'},res=>{let data='';res.on('data',x=>data+=x);res.on('end',()=>{const p=JSON.parse(data);p.ok?resolve(p.result):reject(new Error(p.error))})});req.on('error',reject);req.end(JSON.stringify({action,...args}))
 })}
 async function until(check){for(let i=0;i<200;i++){const value=await check();if(value)return value;await new Promise(r=>setTimeout(r,20))}throw Error('fixture timeout')}
 await action('inner-start');await until(async()=>{const s=await action('inner-read');return s.screen.includes('READY')})
 const message=path.join(c.staging,'request.md');await fs.writeFile(message,'Please build the assigned fixture task.')
 await action('inner-send',{file:message});await until(async()=>{const s=await action('inner-read');return s.screen.includes('DONE')})
 await action('inner-exit');await until(async()=>{const s=await action('inner-read');if(!s.running&&!s.traceSaved)throw Error('trace missing');return !s.running&&s.traceSaved})
 await action('worker-sync',{source:c.taskDir});const script=path.join(c.staging,'check.sh');await fs.writeFile(script,"printf 'remote check done\\n'; printf 'diagnostic\\n' >&2")
 const job=await action('worker-run',{file:script});await until(async()=>{const s=await action('worker-status',{job:job.job});return !s.running})
 await action('worker-logs',{job:job.job})
 const qc=path.join(c.staging,'qc-results');await fs.mkdir(qc)
 const batches=[]
 for(const [lane,checks,ids] of [
  ['preflight',['preflight'],['template-compatible']],['judgment',['judgment'],['swemultimodal/tests-contract']],
  ...['gameability','altsolve','leakage','media-ablation'].map(p=>[p,['swemultimodal/probe-'+p],['swemultimodal/probe-'+p]])
 ]){
  const result=lane+'-initial.json',failed=lane==='gameability'&&process.env.FIXTURE_QC!=='passed'
  await fs.writeFile(path.join(qc,result),JSON.stringify({records:ids.map(check_id=>({check_id,status:'completed',output:{outcome:failed?'failed':'passed',flagged:failed}}))}))
  batches.push({status:'finished',checks,lanes:[{result,checks}]})
 }
 await fs.writeFile(path.join(qc,'ledger.json'),JSON.stringify({initial_judgment:1,batches}))
 const review=path.join(c.staging,'review.json');const disputes=[]
 if(process.env.FIXTURE_QC==='disputed'){
  await fs.writeFile(path.join(c.taskDir,'disputes.md'),'swemultimodal/probe-gameability: excluded behavior')
  await fs.writeFile(path.join(c.staging,'evidence.txt'),'Fixture counterevidence')
  disputes.push({check_id:'swemultimodal/probe-gameability',reason:'Excluded behavior',evidence:['evidence.txt']})
 }
 await fs.writeFile(review,JSON.stringify({disputes}));await action('qc-finalize',{file:review})
 await action('oracle-start');await until(async()=>{const s=await action('oracle-status');if(!s.running&&!s.passed)throw Error(s.error);return s.passed})
 await action('oracle-start'); // An unchanged passing oracle must be reused.
 if(process.env.FIXTURE_MUTATE==='yes')await fs.appendFile(path.join(c.taskDir,'task.toml'),'\nchanged-after-oracle=true\n')
 await fs.writeFile(path.join(c.staging,'validation-summary.md'),'# Fixture validation\nTransport test only, no live models or hosted task.\n')
})().catch(e=>{console.error(e);process.exitCode=1})
