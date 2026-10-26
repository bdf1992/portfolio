const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createSystem,cases,nodeCatalog,request,validatePath}=require('../bounded-model.js');
const settings={lookupLimit:3,revisionLimit:2};
function authored(options=settings){const e=createSystem();e.author(options);return e;}
function stopped(e,id='c1'){e.start(id);return e.runToStop();}

test('baseline graph retains the three cases and runs a successful path to human review',()=>{
  const e=createSystem();assert.equal(e.snapshot().monitoring.internal,null);
  assert.equal(e.snapshot().monitoring.external.authoredRuns,0);assert.equal(e.snapshot().monitoring.external.limitsHeld,true);
  assert.match(e.snapshot().monitoring.external.decision,/Author a bounded/);
  const r=stopped(e);
  assert.equal(cases.length,3);assert.match(request,/monitor/);assert.equal(Object.keys(nodeCatalog).length,8);
  assert.equal(r.status,'review');assert.deepEqual(r.visited,['intake','classify','gather','draft']);
  assert.equal(r.loops.gather,1);assert.match(r.draft,/reprint/);assert.equal(r.pathVersion,0);
  assert.equal(e.snapshot().builder.toolsUsed,0);assert.equal(validatePath(r.path),true);
  assert.equal(e.snapshot().monitoring.internal.runId,r.id);assert.equal(e.snapshot().monitoring.external.authoredRuns,0);
});
test('human approval is required for action and terminal runs are stable',()=>{
  const e=authored(),r=stopped(e,'c2');assert.equal(r.node,'confirm');
  assert.deepEqual(e.step(),r);assert.throws(()=>e.decide('yes'));
  e.decide(true);const done=e.runToStop();assert.equal(done.status,'complete');assert.equal(done.externalActions,false);
  assert.ok(done.log.some(x=>x.node==='confirm'&&x.result==='Approved by a person.'));
  assert.ok(done.log.some(x=>x.node==='act'&&x.result.startsWith('Simulated:')));
  assert.deepEqual(e.runToStop(),done);assert.deepEqual(e.step(),done);assert.throws(()=>e.decide(true));
  assert.match(e.snapshot().builder.observation,/completed after a person approved/);
  const frame=e.snapshot().monitoring.external;assert.equal(frame.completed,1);assert.equal(frame.awaitingReview,0);
  assert.equal(frame.limitsHeld,true);assert.match(frame.summary,/1 completed after approval/);
});
test('the runtime enforces lookup bounds and monitoring reads the actual failed run',()=>{
  const e=authored({lookupLimit:1,revisionLimit:0}),r=stopped(e,'c3');
  assert.equal(r.status,'handoff');assert.equal(r.loops.gather,1);
  assert.ok(r.log.some(x=>x.event==='lookup_limit'));assert.match(r.log.at(-1).result,/1 lookups/);
  const b=e.snapshot().builder;assert.equal(b.evidence.runId,r.id);assert.equal(b.evidence.limit,'gather');
  assert.equal(b.evidence.lookups,1);assert.equal(b.canRevise,true);assert.match(b.observation,/1 lookups/);
  const monitor=e.snapshot().monitoring;assert.equal(monitor.internal.lookups,1);assert.equal(monitor.internal.lookupLimit,1);
  assert.equal(monitor.internal.lastEvent.node,'handoff');assert.equal(monitor.external.handoffs,1);
  assert.match(monitor.external.decision,/earlier human handoff/);assert.equal(monitor.external.limitsHeld,true);
});
test('revision loops stop at their own cap and reuse the last available draft safely',()=>{
  const e=authored();stopped(e);e.decide(false);let r=e.runToStop();assert.match(r.draft,/Thursday/);
  e.decide(false);r=e.runToStop();assert.equal(r.loops.revise,2);assert.match(r.draft,/Thursday/);
  e.decide(false);r=e.runToStop();assert.equal(r.status,'handoff');assert.equal(r.loops.revise,2);
  assert.ok(r.log.some(x=>x.event==='revision_limit'));assert.equal(e.snapshot().builder.canRevise,false);
});
test('zero permitted revisions hands a returned draft to a person immediately',()=>{
  const e=authored({lookupLimit:2,revisionLimit:0});stopped(e);e.decide(false);const r=e.runToStop();
  assert.equal(r.status,'handoff');assert.equal(r.loops.revise,0);assert.match(r.log.at(-1).result,/0 revisions/);
});
test('a child total-step limit stops execution before the next tool or approval',()=>{
  const e=authored({...settings,stepLimit:1}),r=stopped(e);
  assert.equal(r.status,'budget_exhausted');assert.equal(r.steps,1);assert.equal(r.node,'classify');
  assert.equal(e.snapshot().monitoring.external.handoffs,1);assert.equal(e.snapshot().monitoring.external.limitsHeld,true);
  assert.ok(r.log.some(x=>x.event==='step_limit'));assert.match(e.snapshot().builder.observation,/1-step bound/);
  const atApproval=authored({...settings,stepLimit:3});stopped(atApproval,'c2');
  assert.equal(atApproval.decide(true).status,'budget_exhausted');assert.ok(!atApproval.snapshot().current.log.some(x=>x.node==='act'));
});
test('authoring produces a validated definition installed as the actual child graph',()=>{
  const e=createSystem(),path=e.author({lookupLimit:2,revisionLimit:1});
  assert.equal(path.createdBy,'Bounded authoring agent');assert.equal(path.id,'Path-1');assert.equal(validatePath(path),true);
  assert.deepEqual(path.limits,{gather:2,revise:1,steps:24});assert.equal(e.snapshot().path.id,path.id);
  assert.deepEqual(e.snapshot().builder.trace.map(x=>x.tool),['catalog.read','paths.write','paths.check','paths.install']);
  assert.match(e.snapshot().monitoring.external.decision,/Run a request/);assert.equal(e.snapshot().monitoring.internal,null);
  assert.equal(stopped(e,'c3').loops.gather,2);
});
test('monitored evidence authors a different path whose saved edges change execution',()=>{
  const e=authored(),failed=stopped(e,'c3'),old=structuredClone(failed);
  const revised=e.revise();assert.equal(revised.version,2);assert.equal(revised.basedOn.runId,failed.id);
  assert.equal(revised.edges.find(x=>x.from==='classify'&&x.on==='missing').to,'handoff');
  assert.ok(!revised.nodes.includes('gather'));assert.ok(!revised.edges.some(x=>x.from==='gather'||x.to==='gather'));assert.equal(validatePath(revised),true);
  assert.equal(e.snapshot().paths[1].edges.find(x=>x.from==='classify'&&x.on==='missing').to,'gather');
  const next=stopped(e,'c3');assert.equal(next.status,'handoff');assert.equal(next.loops.gather,0);
  assert.ok(!next.visited.includes('gather'));assert.deepEqual(e.snapshot().runs[0],old);
  assert.equal(e.snapshot().builder.toolsUsed,12);assert.equal(e.snapshot().builder.canRevise,false);
  const frame=e.snapshot().monitoring.external;assert.equal(frame.authoredRuns,2);assert.equal(frame.completed,0);
  assert.deepEqual(frame.comparison,{caseId:'c3',before:{runId:failed.id,pathId:failed.pathId,steps:failed.steps,lookups:3,status:'handoff'},after:{runId:next.id,pathId:next.pathId,steps:3,lookups:0,status:'handoff'}});
  assert.match(frame.decision,/same request/);assert.match(frame.tradeoff,/may hand off requests a lookup could have resolved/);
  assert.equal(frame.limitsHeld,true);
  e.start('c2');assert.match(e.snapshot().monitoring.external.decision,/Continue the current run/);
  assert.deepEqual(e.snapshot().monitoring.external.comparison,frame.comparison);
  e.runToStop();const awaiting=e.snapshot().monitoring.external;
  assert.match(awaiting.decision,/Wait for a person/);assert.equal(awaiting.completed,0);
  assert.equal(awaiting.awaitingReview,1);assert.deepEqual(awaiting.comparison,frame.comparison);
  assert.equal(e.snapshot().builder.toolsUsed,14);
});
test('successful or unrelated evidence cannot authorize a path revision',()=>{
  const e=createSystem();assert.throws(()=>e.revise());stopped(e,'c3');assert.throws(()=>e.revise());
  e.author(settings);stopped(e);assert.throws(()=>e.revise());
  const snapshot=e.snapshot();assert.equal(snapshot.builder.evidence.status,'review');assert.equal(snapshot.paths.length,2);
});
test('monitoring remains subscribed through review and approval without repeatedly charging tools',()=>{
  const e=authored();stopped(e);const first=e.snapshot();assert.equal(first.builder.toolsUsed,6);
  assert.match(first.builder.observation,/waiting for a person/);
  assert.equal(first.monitoring.external.completed,0);assert.equal(first.monitoring.external.awaitingReview,1);
  assert.match(first.monitoring.external.decision,/no completed outcome/);assert.equal(first.monitoring.external.comparison,null);
  e.decide(false);e.runToStop();assert.equal(e.snapshot().builder.toolsUsed,6);
  e.decide(true);e.runToStop();assert.equal(e.snapshot().builder.toolsUsed,6);
  assert.equal(e.snapshot().builder.trace.filter(x=>x.tool==='runs.observe').length,1);
  assert.equal(e.snapshot().builder.evidence.status,'complete');
  assert.equal(e.snapshot().monitoring.external.completed,1);assert.equal(e.snapshot().monitoring.external.limitsHeld,true);
});
test('parent version limit refuses further authoring and preserves every saved definition',()=>{
  const e=authored();e.author({lookupLimit:1,revisionLimit:1});const old=e.snapshot().paths;
  assert.throws(()=>e.author(settings),/two-version limit/);assert.equal(e.snapshot().builder.status,'handoff');
  assert.deepEqual(e.snapshot().paths,old);assert.equal(e.snapshot().builder.toolsUsed,8);
  assert.match(e.snapshot().monitoring.external.decision,/authoring agent has stopped/);
  assert.throws(()=>e.author(settings));assert.throws(()=>e.start('c1'));
});
test('parent run limit bounds authored starts while preserving completed runs',()=>{
  const e=authored();for(let i=0;i<3;i++){stopped(e,'c2');e.decide(true);e.runToStop();}
  const runs=e.snapshot().runs;assert.throws(()=>e.start('c2'),/three-run limit/);
  assert.equal(e.snapshot().builder.runsUsed,3);assert.equal(e.snapshot().builder.toolsUsed,10);
  assert.deepEqual(e.snapshot().runs,runs);assert.equal(e.snapshot().builder.status,'handoff');
});
test('fourteen tools cover two authorings and three observed runs including the evidence-based revision',()=>{
  const e=authored();stopped(e,'c2');e.decide(true);e.runToStop();
  stopped(e,'c3');assert.equal(e.snapshot().builder.toolsUsed,8);
  e.revise();assert.equal(e.snapshot().builder.toolsUsed,12);
  const revised=stopped(e,'c3');assert.equal(revised.loops.gather,0);
  assert.equal(e.snapshot().builder.toolsUsed,14);assert.equal(e.snapshot().builder.maxTools,14);
  assert.throws(()=>e.start('c2'),/three-run limit/);assert.equal(e.snapshot().builder.toolsUsed,14);
  assert.equal(e.snapshot().runs.length,3);assert.equal(e.snapshot().builder.status,'handoff');
});
test('unfinished authored children cannot be abandoned to bypass monitoring charges',()=>{
  const e=authored();e.start('c1');assert.throws(()=>e.author(settings),/Finish the active/);
  assert.match(e.snapshot().monitoring.external.decision,/Continue the current run/);
  assert.throws(()=>e.start('c2'),/Finish the active/);e.step();e.runToStop();
  assert.equal(e.snapshot().builder.toolsUsed,6);
});
test('snapshots and exported fixture edits cannot mutate saved authority or execution state',()=>{
  const e=authored(),r=stopped(e),s=e.snapshot();
  s.path.edges[0].to='act';s.current.path.limits.gather=100;s.builder.toolsUsed=0;s.runs[0].log=[];
  s.monitoring.internal.lookups=100;s.monitoring.external.completed=100;s.monitoring.external.limitsHeld=false;
  cases[0].message='Changed outside';nodeCatalog.act.kind='model';
  assert.equal(e.snapshot().path.edges[0].to,'classify');assert.equal(e.snapshot().current.path.limits.gather,3);
  assert.equal(e.snapshot().builder.toolsUsed,6);assert.deepEqual(e.snapshot().runs[0],r);
  assert.equal(e.snapshot().monitoring.internal.lookups,1);assert.equal(e.snapshot().monitoring.external.completed,0);
  assert.equal(e.snapshot().monitoring.external.limitsHeld,true);
  assert.notEqual(stopped(createSystem()).log[0].given,'Changed outside');
});
test('invalid authoring settings and unknown operations have no partial effects',()=>{
  const e=createSystem(),before=e.snapshot();
  for(const options of [null,{}, {...settings,lookupLimit:0},{...settings,lookupLimit:4},{...settings,lookupLimit:1.5},
    {...settings,revisionLimit:-1},{...settings,revisionLimit:3},{...settings,stepLimit:0},{...settings,stepLimit:25},{...settings,stepLimit:'2'}])assert.throws(()=>e.author(options));
  assert.throws(()=>e.start('unknown'));assert.throws(()=>e.step());assert.throws(()=>e.runToStop());assert.throws(()=>e.decide(true));
  assert.deepEqual(e.snapshot(),before);
});
test('graph validation refuses missing nodes, bad bounds and approval bypass transitions',()=>{
  const p=createSystem().snapshot().path;
  for(const invalid of [null,{}, {...p,nodes:['intake']},{...p,nodes:[...p.nodes.slice(1),'act']},{...p,missing:'guess'},
    {...p,limits:null},{...p,limits:{gather:3,revise:2,steps:25}},{...p,edges:null},{...p,edges:p.edges.slice(1)},
    {...p,edges:p.edges.map(x=>x.from==='intake'?{...x,to:'act'}:x)},{...p,edges:[...p.edges.slice(1),p.edges[1]]}])assert.equal(validatePath(invalid),false);
});
test('subscriptions receive the same state used by execution and unsubscribe cleanly',()=>{
  const e=createSystem(),seen=[];assert.throws(()=>e.subscribe(null));
  const leave=e.subscribe(s=>seen.push(s));e.author(settings);e.start('c2');e.step();
  assert.equal(seen.at(-1).current.node,'classify');assert.equal(seen.at(-1).path.id,'Path-1');
  const count=seen.length;leave();e.step();assert.equal(seen.length,count);
  seen[0].path.id='outside';assert.equal(e.snapshot().path.id,'Path-1');
});
test('baseline retained runs are capped and an explicit reset clears the workspace and budgets',()=>{
  const e=createSystem();for(let i=0;i<20;i++)stopped(e,'c2');
  assert.throws(()=>e.start('c2'),/20 runs/);assert.equal(e.snapshot().runs.length,20);
  let resets=0;e.subscribe(()=>resets++);const fresh=e.reset();assert.equal(resets,1);
  assert.equal(fresh.path.version,0);assert.equal(fresh.runs.length,0);assert.equal(fresh.builder.toolsUsed,0);
  assert.equal(fresh.builder.status,'ready');assert.equal(e.author(settings).version,1);
});
test('lower child bounds stay pinned when a later path is authored',()=>{
  const e=authored({lookupLimit:1,revisionLimit:0}),r=stopped(e,'c3');
  e.author({lookupLimit:3,revisionLimit:2});const s=e.snapshot();
  assert.deepEqual(s.runs[0],r);assert.equal(s.runs[0].path.limits.gather,1);assert.equal(s.path.limits.gather,3);
  assert.equal(s.builder.versionsUsed,2);assert.ok(s.builder.trace.every(x=>typeof x.detail==='string'));
});
