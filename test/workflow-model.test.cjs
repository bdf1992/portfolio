const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, evaluateDraft } = require('../workflow-model.js');
function enabled(engine) { engine.setGrant('read',true); engine.setGrant('draft',true); return engine; }
function ready(engine) { return engine.startRun().id; }

test('a fresh agent receives saved context without conversation history',()=>{
  const e=createEngine(), r=e.startRun(); assert.deepEqual(r.packet.conversationHistory,[]);
  assert.equal(r.packet.domain,'Print production'); assert.equal(r.packet.grantScope,'print');
});
test('policy access stops at a missing grant',()=>{
  const e=createEngine(), id=ready(e), r=e.runToStop(id); assert.equal(r.status,'blocked');
  assert.equal(r.trace.at(-1).node,'policy'); assert.equal(r.policy,null);
});
test('read permission does not grant drafting permission',()=>{
  const e=createEngine(); e.setGrant('read',true); const r=e.runToStop(ready(e));
  assert.equal(r.status,'blocked'); assert.equal(r.trace.at(-1).node,'draft'); assert.equal(r.output,null);
});
test('live permission can unblock a pinned run',()=>{
  const e=createEngine(), id=ready(e); e.runToStop(id); enabled(e);
  assert.equal(e.runToStop(id).status,'review');
});
test('revoking a grant stops an existing run at the next action',()=>{
  const e=enabled(createEngine()), id=ready(e); e.step(id); e.step(id); e.setGrant('draft',false);
  const r=e.step(id); assert.equal(r.status,'blocked'); assert.equal(r.output,null);
});
test('grants belong to a business workspace',()=>{
  const e=enabled(createEngine()); e.selectWorkspace('field');
  const r=e.runToStop(ready(e)); assert.equal(r.status,'blocked'); assert.equal(r.workspaceName,'Field service');
});
test('switching the active workspace does not change a run grant scope',()=>{
  const e=enabled(createEngine()), id=ready(e); e.selectWorkspace('field');
  assert.equal(e.runToStop(id).status,'review');
});
test('a person accepts a draft without sending it',()=>{
  const e=enabled(createEngine()), id=ready(e); e.runToStop(id);
  const r=e.review(id,true); assert.equal(r.status,'accepted'); assert.equal(r.output.sent,false);
});
test('a rejected run remains inspectable',()=>{
  const e=enabled(createEngine()), id=ready(e); e.runToStop(id);
  const r=e.review(id,false); assert.equal(r.status,'rejected'); assert.ok(r.output);
  assert.equal(e.step(id).trace.length,r.trace.length);
});
test('the agent cannot send even after human draft acceptance',()=>{
  const e=enabled(createEngine()), id=ready(e); e.runToStop(id); e.review(id,true);
  const r=e.trySend(id); assert.equal(r.output.sent,false); assert.equal(r.trace.at(-1).result,'refused');
});
test('changing the tool changes only subsequent run policy results',()=>{
  const e=enabled(createEngine()), a=ready(e); e.updateComponent('tool');
  const old=e.runToStop(a), newer=e.runToStop(ready(e));
  assert.equal(old.policy.eligible,false); assert.equal(newer.policy.eligible,true);
  assert.equal(old.policy.windowDays,7); assert.equal(newer.policy.windowDays,14);
});
test('changing the base exposes the old agent evidence gap',()=>{
  const e=enabled(createEngine()); e.updateComponent('base');
  const r=e.runToStop(ready(e)); assert.equal(r.status,'needs_revision'); assert.equal(r.trace.at(-1).node,'check');
  const policy={version:2,windowDays:14};
  assert.equal(evaluateDraft({citation:true,text:'No supporting policy is cited.'},policy).ok,false);
  assert.equal(evaluateDraft({text:'Source: policy v1, 7-day window.'},policy).ok,false);
  assert.equal(evaluateDraft(null,policy).ok,false);
  assert.equal(evaluateDraft({citation:false,text:'Source: policy v2, 14-day window.'},policy).ok,true);
});
test('updating agent instructions satisfies the new base check',()=>{
  const e=enabled(createEngine()); e.updateComponent('base'); e.updateComponent('agent');
  const r=e.runToStop(ready(e)); assert.equal(r.status,'review'); assert.equal(r.output.citation,true);
  assert.ok(r.trace.some(x=>x.actor==='evaluator'&&x.result==='passed'));
});
test('an in-progress run retains the base it started with',()=>{
  const e=enabled(createEngine()), id=ready(e); e.updateComponent('base');
  const r=e.runToStop(id); assert.equal(r.status,'review'); assert.ok(!r.nodes.includes('check'));
});
test('personalization changes a later draft and preserves the old packet',()=>{
  const e=enabled(createEngine()), id=ready(e); e.saveCustomization({tone:'warm'});
  const a=e.runToStop(id), b=e.runToStop(ready(e));
  assert.equal(a.packet.tone,'concise'); assert.equal(b.packet.tone,'warm');
  assert.ok(!a.output.text.startsWith('Thanks')); assert.ok(b.output.text.startsWith('Thanks'));
});
test('customization changes the local instruction and channel of a new run',()=>{
  const e=enabled(createEngine()), id=ready(e);
  e.saveCustomization({request:'A new request',focus:'A new local instruction',channel:'Customer portal'});
  const r=e.runToStop(ready(e)); assert.equal(r.output.channel,'Customer portal');
  assert.equal(r.output.focus,'A new local instruction'); assert.notEqual(e.snapshot().runs[0].packet.request,r.packet.request);
  assert.equal(e.snapshot().runs[0].id,id);
});
test('saved customization and personalization have separate versions',()=>{
  const e=createEngine(); e.saveCustomization({tone:'warm'}); assert.equal(e.versions().customization,1);
  assert.equal(e.versions().personalization,2); e.saveCustomization({focus:'Different focus'});
  assert.equal(e.versions().customization,2); assert.equal(e.versions().personalization,2);
});
test('an execution update can exhaust the next run while old limits persist',()=>{
  const e=enabled(createEngine()), old=ready(e); e.updateComponent('execution'); const limited=ready(e);
  assert.equal(e.runToStop(limited).status,'budget_exhausted'); assert.equal(e.runToStop(old).status,'review');
  e.updateComponent('execution'); assert.equal(e.runToStop(ready(e)).status,'review');
});
test('a completed run cannot be stepped again',()=>{
  const e=enabled(createEngine()), id=ready(e); const r=e.runToStop(id);
  assert.equal(e.step(id).trace.length,r.trace.length); e.review(id,true);
  assert.equal(e.step(id).status,'accepted');
});
test('returned snapshots cannot mutate engine state or run pins',()=>{
  const e=createEngine(), r=e.startRun(); r.pins.tool.windowDays=999;
  const s=e.snapshot(); s.workspaces.print.grants.read=true;
  assert.equal(e.snapshot().runs[0].pins.tool.windowDays,7); assert.equal(e.snapshot().workspaces.print.grants.read,false);
});
test('invalid operations and premature review are refused',()=>{
  const e=createEngine(); assert.throws(()=>e.selectWorkspace('missing'));
  assert.throws(()=>e.step('missing')); assert.throws(()=>e.updateComponent('missing'));
  assert.throws(()=>e.setGrant('send',true)); assert.throws(()=>e.setGrant('read','yes'));
  assert.throws(()=>e.review(ready(e),true));
});
test('invalid customization is atomic and unchanged saves retain versions',()=>{
  const e=createEngine(), before=e.versions(); e.saveCustomization({}); e.saveCustomization({tone:'concise'});
  assert.deepEqual(e.versions(),before); e.setGrant('read',false);
  assert.throws(()=>e.saveCustomization({request:''})); assert.throws(()=>e.saveCustomization({focus:'x'.repeat(501)}));
  assert.throws(()=>e.saveCustomization({channel:'SMS'})); assert.throws(()=>e.saveCustomization({tone:'rude'}));
  assert.deepEqual(e.versions(),before);
});
test('a second business uses its own saved case and result',()=>{
  const e=createEngine(); e.selectWorkspace('field'); enabled(e); const r=e.runToStop(ready(e));
  assert.equal(r.packet.channel,'Customer portal'); assert.match(r.output.text,/return visit/);
});
test('the example bounds retained run count',()=>{
  const e=createEngine(); for(let i=0;i<20;i++) e.startRun();
  assert.throws(()=>e.startRun()); assert.equal(e.snapshot().runs.length,20);
});
