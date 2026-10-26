const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine, routeRequest, validateWorker } = require('../assistant-model.js');
const { evaluateDraft } = require('../workflow-model.js');

function allow(engine) {
  for (const kind of ['read','write','execute']) engine.setGrant(kind,true);
  return engine;
}
function finish(engine,text='Build a specialist agent for this business.') {
  return engine.runToStop(engine.submit(text).id);
}

test('direct help reads records without manufacturing a specialist agent',()=>{
  const e=createEngine();e.setGrant('read',true);
  const r=finish(e,'What is holding up the work?');
  assert.equal(r.path,'direct');assert.equal(r.status,'complete');
  assert.equal(r.result.additionalAgents,0);
  assert.deepEqual(r.result.records.map(item=>item.id),['P-104','P-108']);
  assert.equal(r.artifacts.engineer,undefined);assert.equal(r.artifacts.worker,undefined);
  assert.ok(r.trace.every(item=>item.tool!=='agents.define'));
  assert.match(e.snapshot().workspaces.print.messages.at(-1).text,/created no additional agent/);
  assert.equal(routeRequest('Create a daily review list.'),'automation');
  assert.equal(routeRequest('Build an agent for daily review.'),'delegate');
  const clarification=e.submit('Can you help with this?');
  assert.equal(clarification.status,'clarification');
  assert.deepEqual(e.advance(clarification.id).trace,[]);
});

test('ordinary automation executes its saved rule with no additional agent or real schedule',()=>{
  const e=allow(createEngine()), r=finish(e,'Flag overdue work for a daily review list.');
  assert.equal(r.path,'automation');assert.equal(r.status,'complete');
  assert.equal(r.artifacts.automation.type,'ordinary rule');
  assert.equal(r.artifacts.automation.scheduled,false);assert.equal(r.result.additionalAgents,0);
  const rule=r.artifacts.automation.condition;
  const expected=r.artifacts.records.filter(item=>item.status===rule.status&&item.ageDays>rule.minimumDays);
  assert.deepEqual(r.result.records,expected);assert.equal(expected.length,2);
  assert.equal(r.artifacts.engineer,undefined);assert.equal(r.artifacts.worker,undefined);
  assert.ok(r.trace.every(item=>item.actor==='Assistant'));
  const first=e.submit('Create a daily review list.'), second=e.submit('Automate a daily review list.');
  const firstResult=e.runToStop(first.id), secondResult=e.runToStop(second.id);
  assert.notEqual(firstResult.artifacts.automation.id,secondResult.artifacts.automation.id,
    'Interleaved authoring requests need distinct rule identities');
});

test('the assistant authors an engineer which authors the workflow and cold worker actually executed',()=>{
  const e=allow(createEngine());e.selectWorkspace('field');allow(e);
  e.updateComponent('customization');e.updateComponent('personalization');e.updateComponent('tool');
  const r=finish(e), {engineer,workflow,worker,checks,execution}=r.artifacts;
  assert.equal(r.status,'review');assert.equal(engineer.createdBy,'Assistant');
  assert.equal(workflow.createdBy,engineer.id);assert.equal(worker.createdBy,engineer.id);
  assert.equal(worker.workflowId,workflow.id);assert.equal(worker.workspaceId,'field');
  assert.deepEqual(engineer.conversationHistory,[]);assert.deepEqual(worker.conversationHistory,[]);
  assert.equal(engineer.context.goal,r.request);assert.equal(checks.passed,true);
  assert.equal(execution.packet.request,worker.context.request);
  assert.equal(execution.packet.focus,workflow.localInstruction);
  assert.equal(execution.packet.channel,workflow.channel);
  assert.equal(execution.packet.tone,worker.context.tone);
  assert.equal(execution.packet.conversationHistory.length,0);
  assert.deepEqual(execution.nodes,workflow.nodes);
  assert.deepEqual(workflow.surface,{kind:'case-review',panels:['source-files','reply'],actions:['approve-draft','send-back'],humanApproval:true});
  assert.match(r.result.output.text,/return visit/);assert.match(r.result.output.text,/at no charge/);
  assert.equal(r.result.additionalAgents,2);assert.equal(r.result.createdBy,engineer.id);
  assert.ok(r.trace.some(item=>item.actor==='Engineering agent'&&item.tool==='agents.define'));
  assert.deepEqual(r.trace.filter(item=>item.tool==='agents.define').map(item=>[item.position,item.actor]),[[1,'Assistant'],[3,'Engineering agent']]);
  assert.ok(r.trace.some(item=>item.actor===worker.id&&item.tool==='worker.run'));
});

test('live grants stop authoring and stay bound to the original workspace during switching',()=>{
  const e=createEngine();e.setGrant('read',true);
  const id=e.submit('Build an agent.').id;e.advance(id);
  let r=e.advance(id);assert.equal(r.status,'blocked');assert.equal(r.artifacts.engineer,undefined);
  e.setGrant('write',true);r=e.advance(id);assert.ok(r.artifacts.engineer);
  e.setGrant('write',false);r=e.advance(id);
  assert.equal(r.status,'blocked');assert.equal(r.artifacts.workflow,undefined);
  e.setGrant('write',true);e.setGrant('execute',true);e.advance(id);
  e.selectWorkspace('field');
  r=e.runToStop(id);assert.equal(r.status,'review');assert.equal(r.workspaceId,'print');
  const field=finish(e,'Show what is waiting.');
  assert.equal(field.status,'blocked');assert.equal(field.artifacts.records,undefined);
  assert.match(field.trace.at(-1).detail,/Field service/);
});

test('all six dependency updates affect a later request while an earlier request remains pinned',()=>{
  const e=allow(createEngine()), old=e.submit('Build an agent.');
  const initial=e.snapshot().runs[0].pins;
  for(const kind of ['base','agent','tool','execution','customization','personalization']) e.updateComponent(kind);
  e.updateComponent('execution'); // Restore a usable limit for the new version, leaving the old one pinned.
  const previous=e.runToStop(old.id), current=finish(e);
  assert.deepEqual(previous.pins,initial);
  assert.deepEqual(previous.versions,{base:1,agent:1,tool:1,execution:1,customization:1,personalization:1});
  assert.deepEqual(current.versions,{base:2,agent:2,tool:2,execution:3,customization:2,personalization:2});
  assert.equal(previous.artifacts.execution.policy.windowDays,7);
  assert.equal(current.artifacts.execution.policy.windowDays,14);
  assert.equal(previous.artifacts.worker.context.tone,'concise');
  assert.equal(current.artifacts.worker.context.tone,'warm');
  assert.notEqual(previous.artifacts.workflow.localInstruction,current.artifacts.workflow.localInstruction);
  assert.ok(!previous.artifacts.workflow.nodes.includes('check'));
  assert.ok(current.artifacts.workflow.nodes.includes('check'));
  assert.deepEqual(previous.artifacts.execution.nodes,previous.artifacts.workflow.nodes);
  assert.deepEqual(current.artifacts.execution.nodes,current.artifacts.workflow.nodes);
  assert.equal(evaluateDraft(current.result.output,current.artifacts.execution.policy).ok,true);
});

test('a failed actual sample can drive a new authored version without rewriting its source evidence',()=>{
  const e=allow(createEngine());e.updateComponent('base');
  const failed=finish(e);assert.equal(failed.status,'needs_revision');
  assert.equal(failed.artifacts.checks.sampleStatus,'needs_revision');
  assert.ok(failed.artifacts.checks.sampleTrace.some(item=>item.node==='check'&&item.result==='failed'));
  assert.equal(evaluateDraft(failed.artifacts.checks.sampleOutput,{version:1,windowDays:7}).ok,false);
  const retained=structuredClone(failed), next=e.reviseFromEvidence(failed.id);
  assert.equal(next.parentId,failed.id);assert.equal(next.versions.agent,2);
  assert.ok(next.trace.some(item=>item.tool==='evidence.read'&&item.result==='used'));
  const fixed=e.runToStop(next.id);assert.equal(fixed.status,'review');
  assert.equal(evaluateDraft(fixed.result.output,fixed.artifacts.execution.policy).ok,true);
  assert.deepEqual(e.snapshot().runs.find(item=>item.id===failed.id),retained);
});

test('evidence revision refuses missing live grants, unrelated results and cross-workspace evidence',()=>{
  const e=allow(createEngine());e.updateComponent('base');const failed=finish(e);
  const before=e.versions();e.setGrant('write',false);
  assert.throws(()=>e.reviseFromEvidence(failed.id));assert.deepEqual(e.versions(),before);
  e.setGrant('write',true);e.setGrant('read',false);
  assert.throws(()=>e.reviseFromEvidence(failed.id));assert.deepEqual(e.versions(),before);
  e.setGrant('read',true);const answer=finish(e,'What is waiting?');
  assert.throws(()=>e.reviseFromEvidence(answer.id));
  e.selectWorkspace('field');allow(e);
  assert.throws(()=>e.reviseFromEvidence(failed.id));
  assert.throws(()=>e.submit('Build an agent.',{parentId:failed.id}));
  assert.equal(e.snapshot().runs.find(item=>item.id===failed.id).status,'needs_revision');
});

test('the pinned action budget bounds a request and preserves partial work',()=>{
  const e=allow(createEngine());e.updateComponent('execution');
  const limited=finish(e);assert.equal(limited.status,'budget_exhausted');assert.equal(limited.actions,2);
  assert.ok(limited.artifacts.engineer);assert.equal(limited.artifacts.workflow,undefined);
  assert.equal(limited.artifacts.worker,undefined);assert.equal(limited.trace.at(-1).tool,'limit');
  assert.deepEqual(e.advance(limited.id),limited);
  e.updateComponent('execution');const next=finish(e);
  assert.equal(next.status,'review');assert.equal(next.pins.components.execution.maxActions,12);
  assert.equal(e.snapshot().runs[0].pins.components.execution.maxActions,2);
});

test('a person can accept or reject a proposed result without sending or deploying anything',()=>{
  const e=allow(createEngine()), first=finish(e);
  assert.throws(()=>e.review(first.id,'yes'));
  for(const text of ['',null,'x'.repeat(1001)])assert.throws(()=>e.editDraft(first.id,text));
  const original=structuredClone(first.artifacts.execution.output);
  assert.deepEqual(first.artifacts.worker.context.case,first.pins.workspace.case);
  assert.match(original.text,/\$12.*\$10/);
  const edited=e.editDraft(first.id,'We will check the approved proof before confirming a reprint.');
  assert.equal(edited.result.output.manuallyEdited,true);
  assert.deepEqual(edited.artifacts.execution.output,original);
  assert.equal(edited.trace.at(-1).tool,'draft.edit');
  const accepted=e.review(first.id,true);
  assert.equal(accepted.result.output.text,edited.result.output.text);
  assert.throws(()=>e.editDraft(first.id,'Too late'));
  assert.equal(accepted.status,'accepted');assert.equal(accepted.result.sent,false);
  assert.equal(accepted.result.output.sent,false);assert.equal(accepted.trace.at(-1).actor,'Person');
  assert.deepEqual(e.advance(first.id),accepted);assert.throws(()=>e.review(first.id,true));
  const second=finish(e), rejected=e.review(second.id,false);
  assert.equal(rejected.status,'rejected');assert.equal(rejected.result.output.sent,false);
  assert.deepEqual(e.advance(second.id),rejected);
  const direct=finish(e,'Inspect blocked work.');assert.throws(()=>e.review(direct.id,true));
  assert.ok(!accepted.artifacts.worker.allowedTools.some(tool=>/send|publish|deploy/.test(tool)));
});

test('definition validation rejects scope expansion, forbidden tools and inherited conversation',()=>{
  const valid={workspaceId:'print',allowedTools:['policy.read','draft.prepare'],conversationHistory:[]};
  assert.equal(validateWorker(valid,'print'),true);
  for(const definition of [null,{}, {...valid,workspaceId:'field'}, {...valid,allowedTools:null},
    {...valid,allowedTools:[]}, {...valid,allowedTools:['send']}, {...valid,allowedTools:['policy.read','publish']},
    {...valid,conversationHistory:null}, {...valid,conversationHistory:['private prior conversation']}]) {
    assert.equal(validateWorker(definition,'print'),false);
  }
});

test('invalid API inputs are refused and returned snapshots cannot change authority or authored state',()=>{
  const e=createEngine();
  for(const name of ['missing','toString','constructor','__proto__']) {
    assert.throws(()=>e.selectWorkspace(name));assert.throws(()=>e.updateComponent(name));
  }
  assert.throws(()=>e.setGrant('send',true));assert.throws(()=>e.setGrant('read','true'));
  assert.throws(()=>e.submit(' '));assert.throws(()=>e.submit('x'.repeat(501)));
  assert.throws(()=>e.advance('missing'));assert.throws(()=>e.review('missing',true));
  assert.throws(()=>e.reviseFromEvidence('missing'));
  e.setGrant('read',false);assert.equal(e.snapshot().workspaces.print.grants.revision,1);
  const pending=e.submit('Build an agent.');pending.pins.workspace.grants.read=true;
  const snapshot=e.snapshot();snapshot.workspaces.print.grants.read=true;snapshot.runs[0].pins.workspace.focus='replaced';
  assert.equal(e.snapshot().workspaces.print.grants.read,false);
  assert.notEqual(e.snapshot().runs[0].pins.workspace.focus,'replaced');
  assert.equal(e.advance(pending.id).status,'blocked');
});

test('retained requests are bounded and a refused revision at capacity leaves versions unchanged',()=>{
  const e=allow(createEngine());e.updateComponent('base');const failed=finish(e);
  for(let i=1;i<20;i++) e.submit('What is waiting?');
  assert.equal(e.snapshot().runs.length,20);const before=e.versions();
  assert.throws(()=>e.submit('Build another agent.'));
  assert.throws(()=>e.reviseFromEvidence(failed.id));
  assert.deepEqual(e.versions(),before);assert.equal(e.snapshot().runs.length,20);
});
