(function(){
  'use strict';
  if(!document.getElementById('workflow-workspace'))return;
  const system=window.boundedSystem,el=id=>document.getElementById(id);
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tools={
    'catalog.read':['Read tools','Read the allowed node types and their tools. No extra permission is created.'],
    'paths.write':['Write path','Author a graph from the request, with explicit transitions, human approval and loop limits.'],
    'paths.check':['Check bounds','Validate the graph before it can run. The runtime enforces the saved limits.'],
    'paths.install':['Install in #1','Make this saved path the one #1 uses. Earlier runs keep their original definition.'],
    'runs.start':['Start run','Start a child on the saved path and sample case, within the parent’s run budget.'],
    'runs.observe':['Watch run','Observe actual steps, review stops, outcomes and limits from the shared #1 runtime.']
  };
  const states={ready:'Ready',running:'Running',review:'Waiting for a person',complete:'Completed',handoff:'Handed to a person',budget_exhausted:'Child step limit reached'};
  let chosenTool=null,chosenPath=null,notice='';
  el('ba-request').textContent=BoundedModel.request;
  el('ba-case').innerHTML=[['c1','Reprint request · needs approval'],['c2','Billing request · needs approval'],['c3','Unclear request · reaches lookup limit']].map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
  function perform(fn){try{notice='';fn();}catch(error){notice=error.message;}render();}
  function render(){
    const state=system.snapshot(),b=state.builder,run=state.current,path=state.path;
    el('ba-budget').innerHTML=`<span>Tool calls <b>${b.toolsUsed}/${b.maxTools}</b></span><span>Path versions <b>${b.versionsUsed}/${b.maxVersions}</b></span><span>Child runs <b>${b.runsUsed}/${b.maxRuns}</b></span>`;
    el('ba-tools').innerHTML=Object.entries(tools).map(([key,[label]])=>{const count=b.trace.filter(item=>item.tool===key&&item.result==='used').length;return `<button data-tool="${key}" aria-pressed="${key===chosenTool}">${label}${count?` · ${count} ✓`:''}</button>`;}).join('');
    el('ba-tools').querySelectorAll('button').forEach(button=>button.onclick=()=>{chosenTool=button.dataset.tool;render();});
    el('ba-tool-detail').textContent=chosenTool?tools[chosenTool][1]:'Scoped tools for creating the path and watching its execution. The parent cannot approve a reply.';
    el('ba-author').disabled=path.version>0;
    el('ba-author').textContent=path.version?`Path v${path.version} installed in #1`:'Author the #1 flow';
    el('ba-status').textContent=notice||(path.version?(path.missing==='handoff'?`Path v${path.version} is installed in #1. Unresolved requests now go straight to a person, without a lookup loop.`:`The graph in #1 now runs the saved path v${path.version}: up to ${path.limits.gather} lookups, ${path.limits.revise} revisions and ${path.limits.steps} total steps.`):'Author a path to replace the base example in #1.');
    el('ba-monitor-title').textContent=`Watching #1 · ${run?`${run.pathId} / ${run.id}`:path.id}`;
    el('ba-child-status').textContent=run?states[run.status]:'No run started';
    const busy=run&&['ready','running','review'].includes(run.status);
    el('ba-run').disabled=!path.version||b.runsUsed>=b.maxRuns||b.toolsUsed+2>b.maxTools||Boolean(busy);
    if(run)el('ba-case').value=run.caseId;
    el('ba-events').innerHTML=run?.log.length?run.log.slice(-4).map(item=>`<li>${esc(item.result)}<small>${esc(BoundedModel.nodeCatalog[item.node].label)} · ${esc(item.kind)}</small></li>`).join(''):'<li class="muted">No child steps observed yet. Run a case here or step through it in #1.</li>';
    el('ba-review').hidden=run?.status!=='review';
    el('ba-draft').hidden=run?.status!=='review';el('ba-draft').textContent=run?.status==='review'?run.draft:'';
    el('ba-observation').textContent=b.observation+(b.runsUsed>=b.maxRuns?' The parent has used its three child runs; further work needs a person to review or reset.':'');
    el('ba-revise').hidden=!b.canRevise;
    if(!chosenPath||!state.paths.some(item=>item.id===chosenPath))chosenPath=path.id;
    el('ba-definition-pick').innerHTML=state.paths.map(item=>`<option value="${esc(item.id)}" ${chosenPath===item.id?'selected':''}>${esc(item.id)} · ${esc(item.createdBy)}</option>`).join('');
    el('ba-definition').textContent=JSON.stringify(state.paths.find(item=>item.id===chosenPath),null,2);
    el('ba-trace').innerHTML=b.trace.map(item=>`<li><strong>${esc(item.tool)}</strong> · ${esc(item.result)} · ${esc(item.detail)}</li>`).join('');
    el('ba-history').innerHTML=state.runs.map(item=>`<div>${esc(item.id)} · ${esc(item.pathId)} · ${esc(states[item.status])} · ${item.steps} steps</div>`).join('');
    window.canvasRedraw?.();
  }
  el('ba-author').onclick=()=>perform(()=>{const path=system.author({lookupLimit:3,revisionLimit:2});chosenPath=path.id;});
  el('ba-run').onclick=()=>perform(()=>{system.start(el('ba-case').value);system.runToStop();});
  el('ba-approve').onclick=()=>perform(()=>{system.decide(true);system.runToStop();});
  el('ba-back').onclick=()=>perform(()=>{system.decide(false);system.runToStop();});
  el('ba-revise').onclick=()=>perform(()=>{const path=system.revise();chosenPath=path.id;});
  el('ba-reset').onclick=()=>perform(()=>{system.reset();chosenPath=null;chosenTool=null;});
  el('ba-definition-pick').onchange=()=>{chosenPath=el('ba-definition-pick').value;render();};
  el('ba-inspector').addEventListener('toggle',()=>window.canvasRedraw?.());
  system.subscribe(render);window.workflowDemo=system;render();
})();
