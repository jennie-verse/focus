import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
const app = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')
const tickSource = app.slice(app.indexOf('function stopTicking()'), app.indexOf('async function releaseWakeLock()'))
const finishSource = app.slice(app.indexOf('async function finishSession('), app.indexOf('// ---------- sync ----------'))

test('a reopened expired timer finishes exactly once even when remaining time already equals zero', () => {
  const state = {timer:{status:'running', remainingSeconds:0, targetEnd:Date.now()-1000}}
  let finishes = 0; let interval
  const context = vm.createContext({state, Date, completing:false, tickInterval:null,
    window:{setInterval(fn){interval=fn; return 1}, clearInterval(){}},
    finishSession(){finishes++; context.completing=true}, persistTimer(){}, updateRing(){}, document:{getElementById(){}}})
  vm.runInContext(tickSource+'\nstartTicking()', context)
  interval(); interval()
  assert.equal(finishes, 1)
})

function lifecycle(addSession) {
  const now=Date.now(); const session={status:'running', mode:'focus', remainingSeconds:0, totalSeconds:1500, startedAt:now-1600000, targetEnd:now-100000}
  const state={timer:session, subject:'English', task:'단어 복습', settings:{autoStart:false}, screen:'timer'}
  const records=[]; const journal=[]
  const context=vm.createContext({state, Date, Math, completing:false, MIN_JOURNAL_SESSION_SECONDS:180,
    addSession:async item=>{await addSession(item);records.push(item)}, getSessions:async()=>records,
    makeId:()=> 'session-id', clearActiveTimer(){}, setTimer(timer){state.timer=timer}, render(){}, toast(){},
    nextModeAfter:()=> 'short', createTimer:mode=>({mode,status:'idle'}),
    JournalApi:{queueSession:item=>journal.push(item)}, SyncApi:{sessionToEvent:()=>null,isReady:()=>false}, readSyncState(){}})
  vm.runInContext(finishSource,context)
  return {context,state,records,journal,deadline:session.targetEnd}
}
test('completed sessions use their actual deadline and publish only after durable save',async()=>{
  const run=lifecycle(async()=>{})
  await vm.runInContext('finishSession(true)',run.context)
  assert.equal(run.records[0].endedAt,run.deadline)
  assert.equal(run.records[0].task,'단어 복습')
  assert.equal(run.journal.length,1)
  assert.equal(run.state.timer.mode,'short')
})
test('failed session storage preserves a paused timer and allows a retry without publishing',async()=>{
  let fail=true
  const run=lifecycle(async()=>{if(fail)throw new Error('Quota exceeded')})
  await vm.runInContext('finishSession(true)',run.context)
  assert.equal(run.state.timer.status,'paused')
  assert.equal(run.state.task,'단어 복습')
  assert.equal(run.journal.length,0)
  assert.equal(run.context.completing,false)
  fail=false
  await vm.runInContext('finishSession(false)',run.context)
  assert.equal(run.records.length,1)
  assert.equal(run.records[0].completed,true)
  assert.equal(run.records[0].endedAt,run.deadline)
  assert.equal(run.records[0].id,'session-id')
})
