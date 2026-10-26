const {test}=require('node:test');
const assert=require('node:assert/strict');
const {authorIntake,validateIntake,executeIntake}=require('../workflow-model.js');
const {createEngine}=require('../assistant-model.js');
const requirements={supportQueue:'Service desk',requireContact:true};
const item={id:'X',summary:'System is unavailable',contact:'Alex',category:'support',impact:'normal'};
function engine(){const e=createEngine();e.selectWorkspace('intake');for(const key of ['read','write','execute'])e.setGrant(key,true);return e;}
function build(e){return e.runToStop(e.submit('Build intake triage.').id);}

test('authored intake rules are executable data whose order and destination control results',()=>{
  const f=authorIntake(requirements);assert.equal(validateIntake(f),true);
  const rows=executeIntake(f,[item,{...item,id:'B',category:'billing'},{...item,id:'C',category:'change'},{...item,id:'D',category:'other'}]);
  assert.deepEqual(rows.map(r=>r.queue),['Service desk','Finance','Product','Human review']);
  f.rules.find(r=>r.id==='support').outcome.queue='Operations';
  assert.equal(executeIntake(f,[item])[0].queue,'Operations');
  assert.deepEqual(rows[0].trace.map(x=>x.node),f.nodes);assert.equal(rows[0].externalActions,false);
});
test('required details take precedence over urgent routing and contact is configurable',()=>{
  const flow=authorIntake(requirements);
  assert.equal(executeIntake(flow,[{...item,impact:'stopped'}])[0].priority,'Urgent');
  assert.equal(executeIntake(flow,[{...item,impact:'stopped',contact:''}])[0].status,'Needs information');
  assert.equal(executeIntake(flow,[{...item,summary:''}])[0].status,'Needs information');
  assert.equal(executeIntake(authorIntake({...requirements,requireContact:false}),[{...item,contact:''}])[0].queue,'Service desk');
});
test('invalid requirements and malformed workflow definitions are refused',()=>{
  for(const value of [null,{}, {...requirements,supportQueue:''},{...requirements,supportQueue:'x'.repeat(41)},{...requirements,requireContact:'yes'}])assert.throws(()=>authorIntake(value));
  const base=authorIntake(requirements);
  for(const f of [null,{}, {...base,kind:'other'},{...base,nodes:[]},{...base,rules:[]},{...base,rules:Array(9).fill(base.rules[0])},
    {...base,rules:[null]},{...base,rules:[{...base.rules[0],test:{op:'eval'}}]},
    {...base,rules:[{...base.rules[0],test:{op:'missing',fields:['password']}}]},
    {...base,rules:[{...base.rules[1],test:{op:'equals',field:'secret',value:'x'}}]},
    {...base,fallback:{...base.fallback,status:'Routed'}},{...base,rules:[{...base.rules[0],outcome:{queue:'',priority:'x',status:'x'}}]}]){
    assert.equal(validateIntake(f),false);assert.throws(()=>executeIntake(f,[item]));
  }
});
test('intake input validation is bounded and leaves definitions and earlier results unchanged',()=>{
  const f=authorIntake(requirements),before=structuredClone(f),old=executeIntake(f,[item]);
  for(const inputs of [null,[],Array(21).fill(item),[null],[{...item,id:''}],[{...item,id:1}],[{...item,summary:'x'.repeat(301)}],[{...item,contact:4}],[item,item]])assert.throws(()=>executeIntake(f,inputs));
  const normalized=executeIntake(f,[{summary:' Hi ',category:'other'}]);assert.equal(normalized[0].input.id,'Intake-1');
  assert.equal(normalized[0].input.summary,'Hi');assert.equal(normalized[0].status,'Needs information');
  old[0].input.summary='changed';assert.deepEqual(f,before);assert.equal(executeIntake(f,[item])[0].input.summary,item.summary);
});
test('assistant briefs engineer to author and execute triage without manufacturing a worker agent',()=>{
  const e=engine(),r=build(e);
  assert.equal(r.status,'complete');assert.equal(r.kind,'intake');assert.equal(r.artifacts.workflow.createdBy,r.artifacts.engineer.id);
  assert.deepEqual(r.artifacts.engineer.context.requirements,requirements);assert.deepEqual(r.artifacts.engineer.conversationHistory,[]);
  assert.equal(r.artifacts.worker,undefined);assert.equal(r.artifacts.checks.passed,true);
  assert.deepEqual(r.result.rows.map(x=>x.queue),['Service desk','Finance','Requestor']);
  assert.ok(r.trace.some(x=>x.actor==='Engineering agent'&&x.tool==='workflow.define'));
  assert.ok(r.trace.some(x=>x.tool==='workflow.run'));assert.equal(r.result.externalActions,false);
  const custom=e.runIntake(r.id,[{...item,category:'other'}]);assert.equal(custom.rows[0].queue,'Human review');
  assert.equal(e.snapshot().runs[0].executions.length,2);
});
test('requirement changes author a new pinned workflow and preserve previous executions',()=>{
  const e=engine(),first=build(e),retained=structuredClone(first);
  e.saveIntakeRequirements({...requirements,supportQueue:'Operations',requireContact:false});
  const second=build(e);assert.equal(second.versions.customization,2);
  assert.deepEqual(second.result.rows.map(x=>x.queue),['Operations','Finance','Product']);
  assert.equal(e.runIntake(first.id,[item]).rows[0].queue,'Service desk');
  assert.deepEqual(e.snapshot().runs[0].result,retained.result);
  const version=e.versions();e.saveIntakeRequirements({...requirements,supportQueue:'Operations',requireContact:false});assert.deepEqual(e.versions(),version);
  assert.throws(()=>e.saveIntakeRequirements({...requirements,requireContact:'yes'}));assert.deepEqual(e.versions(),version);
});
test('live permissions stop intake authoring and execution without changing earlier results',()=>{
  const e=engine();e.setGrant('write',false);let r=build(e);assert.equal(r.status,'blocked');
  assert.throws(()=>e.runIntake(r.id,[item]));e.setGrant('write',true);e.setGrant('execute',false);
  r=e.runToStop(r.id);assert.equal(r.status,'blocked');e.setGrant('execute',true);r=e.runToStop(r.id);
  const original=structuredClone(r.executions);e.setGrant('read',false);assert.throws(()=>e.runIntake(r.id,[item]));
  e.setGrant('read',true);e.setGrant('execute',false);assert.throws(()=>e.runIntake(r.id,[item]));
  assert.deepEqual(e.snapshot().runs[0].executions,original);
  const other=createEngine();assert.throws(()=>other.saveIntakeRequirements(requirements));
  for(const key of ['read','write','execute'])other.setGrant(key,true);
  const non=other.runToStop(other.submit('Build an agent.').id);assert.throws(()=>other.runIntake(non.id,[item]));
});
test('intake executions have separate bounded identities and returned snapshots cannot edit saved rules',()=>{
  const e=engine(),r=build(e);r.artifacts.workflow.rules[0].outcome.queue='Hijacked';
  for(let i=2;i<=10;i++)assert.equal(e.runIntake(r.id,[item]).id,`Execution ${i}`);
  assert.throws(()=>e.runIntake(r.id,[item]));assert.equal(e.snapshot().runs[0].executions.length,10);
  assert.equal(e.snapshot().runs[0].artifacts.workflow.rules[0].outcome.queue,'Requestor');
});
