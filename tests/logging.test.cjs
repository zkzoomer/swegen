const {test} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')
const {spawnSync} = require('node:child_process')
const {createRedactor, createWorkerLog, formatWorkerItem, createProgressReporter, commandPreview} = require('../agent/logging.cjs')
const {downloadReviewLogs, preserveThenDelete} = require('../dist/review-logs.js')

test('console shows commands once when they start, without tool output or commentary', () => {
 const lines=[],progress=createProgressReporter(line=>lines.push(line))
 const item={id:'c1',type:'command_execution',command:'pytest -q',status:'in_progress'}
 progress({type:'item.started',item})
 progress({type:'item.updated',item:{...item,aggregated_output:'large partial output'}})
 progress({type:'item.completed',item:{...item,status:'completed',exit_code:0,aggregated_output:'full test output'}})
 for(const type of ['reasoning','agent_message','todo_list','file_change'])progress({type:'item.completed',item:{id:type,type,text:'private analysis',changes:[],items:[]}})
 progress({type:'item.completed',item:{id:'m1',type:'mcp_tool_call',server:'browser',tool:'read',arguments:{secret:'arguments'},result:{content:'large result'}}})
 assert.deepEqual(lines,['$ pytest -q','Tool: browser/read'])
 assert.equal(formatWorkerItem({type:'command_execution',command:'python3 - <<\'PY\'\nprint("script payload")\nPY'}),"$ python3 - <<'PY' [2 more lines]")
 assert.ok(commandPreview('x'.repeat(10000)).length<250)
})

test('journal omits intermediate payloads and successful output; keeps failure diagnostics once', async () => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'swegen-events-'))
 try {
  const log=createWorkerLog(dir,createRedactor(['fixture-private-token']))
  const item={id:'1',type:'command_execution',command:'pytest -q',status:'in_progress'}
  log.event({type:'run.input',prompt:'do not duplicate the prompt'})
  log.event({type:'thread.started',thread_id:'thread-1'})
  for(let i=0;i<200;i++)log.event({type:'item.updated',item:{...item,aggregated_output:'repeated screen'.repeat(1000)}})
  log.event({type:'item.completed',item:{...item,status:'completed',exit_code:0,aggregated_output:'success output'}})
  for(const type of ['reasoning','agent_message','todo_list'])log.event({type:'item.completed',item:{id:type,type,text:'private analysis',items:[]}})
  log.event({type:'item.completed',item:{id:'m',type:'mcp_tool_call',server:'browser',tool:'read',status:'completed',arguments:{huge:'arguments'},result:{content:'huge tool result'}}})
  const diagnostic=log.event({type:'item.completed',item:{...item,id:'2',status:'failed',exit_code:1,aggregated_output:'FAILED: selected item stayed hidden; fixture-private-token'}})
  log.event({type:'turn.failed',error:{message:'fixture-private-token'}})
  assert.equal(log.text('visible command'),'visible command')
  const text=await fs.readFile(path.join(dir,'outer-events.jsonl'),'utf8')
  const records=text.trim().split('\n').map(JSON.parse)
  assert.deepEqual(records.map(record=>record.event.type),['run.input','thread.started','item.completed','item.completed','item.completed','turn.failed'])
  assert.equal(records[4].event.item.exit_code,1)
  assert.equal(records[4].event.diagnostic,diagnostic)
  assert.equal(records[5].event.error.message,'[REDACTED]')
  assert.doesNotMatch(text,/repeated screen|success output|private analysis|huge tool result|huge.*arguments|do not duplicate the prompt|selected item stayed hidden/)
  assert.equal(await fs.readFile(diagnostic,'utf8'),'FAILED: selected item stayed hidden; [REDACTED]')
  assert.equal((await fs.stat(diagnostic)).mode & 0o777,0o600)
  assert.equal((await fs.stat(path.join(dir,'outer-events.jsonl'))).mode & 0o777,0o600)
  assert.equal((await fs.readdir(dir)).includes('outer.txt'),false)
  assert.ok(Buffer.byteLength(text)<2000,'Intermediate screen updates must not grow the journal')
 } finally {await fs.rm(dir,{recursive:true,force:true})}
})

test('local transcript captures both streams, strips ANSI and redacts split writes', async () => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'swegen-transcript-'))
 try {
  const file=path.join(dir,'controller.txt')
  const helper=path.resolve(__dirname,'../agent/logging.cjs')
  const program=`const l=require(${JSON.stringify(helper)}); const close=l.installTranscript(process.argv[1],l.createRedactor(['private-fixture-secret'])); process.stdout.write('\\x1b[31mhello\\x1b[0m private-fixture-'); process.stdout.write('secret\\n'); require('node:fs').appendFileSync(process.argv[1],'INNER TRACE\\n'); process.stderr.write('stderr without newline'); close(); close();`
  const run=spawnSync(process.execPath,['-e',program,file],{encoding:'utf8'})
  assert.equal(run.status,0,run.stderr)
  const text=await fs.readFile(file,'utf8')
  assert.match(text,/\[stdout\] hello \[REDACTED\]/)
  assert.match(text,/\[stderr\] stderr without newline/)
  assert.match(text,/INNER TRACE/)
  assert.doesNotMatch(text,/\x1b|private-fixture-secret/)
  assert.equal((await fs.stat(file)).mode & 0o777,0o600)
 } finally {await fs.rm(dir,{recursive:true,force:true})}
})

test('redaction handles known base64 credentials and common unexpected token fields', () => {
 const key='fixture-secret-key-1234'
 const redact=createRedactor([key]).redact
 assert.equal(redact(Buffer.from(key).toString('base64')),'[REDACTED]')
 assert.equal(JSON.parse(redact('{"access_token":"unexpected-private-token"}')).access_token,'[REDACTED]')
 assert.match(redact('Bearer abcdefghijklmnopqrstuvwxyz'),/Bearer \[REDACTED\]/)
})

function transport(bytes, {corrupt=false, errors=[]}={}) {
 return {
  process:{async executeCommand(command){
   const remote=command.match(/'([^']+)'$/)[1]
   return {exitCode:0,result:JSON.stringify({path:remote,size:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),files:3,errors})}
  }},
  fs:{async downloadFile(remote,local){await fs.writeFile(local,corrupt?Buffer.from('bad download'):bytes)}}
 }
}

test('remote log bundle is downloaded and hash verified before worker deletion', async () => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'swegen-download-'))
 try {
  let saved,deleted=false
  const transcript=path.join(dir,'controller.txt')
  await fs.writeFile(transcript,'commands only\n')
  await preserveThenDelete(async()=>{saved=await downloadReviewLogs(transport(Buffer.from('private review bundle')),dir)},async()=>{
   assert.equal(await fs.readFile(saved,'utf8'),'private review bundle'); deleted=true
  })
  assert.equal(deleted,true)
  assert.equal(await fs.readFile(transcript,'utf8'),'commands only\n','Downloaded evidence must not be concatenated into the transcript')
  assert.deepEqual((await fs.readdir(dir)).filter(name=>name.endsWith('.txt')),['controller.txt'])
  assert.equal((await fs.stat(saved)).mode & 0o777,0o600)
 } finally {await fs.rm(dir,{recursive:true,force:true})}
})

for(const [name,options,message] of [['corrupt download',{corrupt:true},/integrity verification/],['unreadable source',{errors:[{path:'events.jsonl',error:'unreadable'}]},/Some review logs/]]) {
 test(`${name} prevents worker deletion and leaves partial evidence`,async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'swegen-retention-'))
  try {
   let deleted=false
   await assert.rejects(preserveThenDelete(()=>downloadReviewLogs(transport(Buffer.from('evidence'),options),dir),async()=>{deleted=true}),message)
   assert.equal(deleted,false)
   assert.ok((await fs.readdir(dir)).some(name=>name.endsWith('.zip')))
  } finally {await fs.rm(dir,{recursive:true,force:true})}
 })
}
