(function(){
  'use strict';
  if(!document.getElementById('workflow-workspace'))return;
  const system=window.boundedSystem,el=id=>document.getElementById(id);
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const states={ready:'Ready',running:'Running',review:'Waiting for approval',complete:'Completed',handoff:'With a person',budget_exhausted:'Step limit reached'};
  const terminal=new Set(['complete','handoff','budget_exhausted']);
  const parentNodes={read:{x:15,y:20,label:'Read the request',kind:'exact',detail:'catalog.read: read the request, available tools and bounds.'},
    write:{x:245,y:20,label:'Design the flow',kind:'model',detail:'paths.write / paths.install: create a bounded path and make it the graph in #1.'},
    check:{x:475,y:20,label:'Check its bounds',kind:'exact',detail:'paths.check: check transitions, required approval and limits before a run.'},
    run:{x:475,y:180,label:'Run the child',kind:'exact',detail:'runs.start: give the created agent its own customer request.'},
    watch:{x:245,y:180,label:'Assess the frame',kind:'model',detail:'runs.observe: compare actual outcomes with the original goal, constraints and earlier versions.'},
    person:{x:15,y:180,label:'Person takes over',kind:'person',detail:'The parent stops when its own tool, run or revision bound is reached.'}};
  let chosenParent=null,chosenPath=null,notice='',lastRunId=null;
  el('ba-request').textContent=BoundedModel.request;
  el('ba-case').innerHTML=[['c1','Reprint request'],['c2','Billing request'],['c3','Unclear request']].map(([id,label])=>`<option value="${id}">${label}</option>`).join('');
  function perform(fn){try{notice='';fn();}catch(error){notice=error.message;}render();}
  function parentMarkup(state){
    const b=state.builder,run=state.current,used=tool=>b.trace.some(item=>item.tool===tool&&item.result==='used');
    const visited={read:used('catalog.read'),write:used('paths.write'),check:used('paths.check'),run:used('runs.start'),watch:used('runs.observe'),person:b.status==='handoff'};
    const active=b.status==='handoff'?'person':!state.path.version?'read':!run?'run':run.status==='ready'||run.status==='running'?'run':'watch';
    const edge=(d,label='',x=0,y=0,loop=false)=>`<path class="edge ${loop?'loop':''}" d="${d}" marker-end="url(#parent-arrow)"/>${label?`<text class="edge-label" x="${x}" y="${y}" text-anchor="middle">${label}</text>`:''}`;
    let svg='<svg viewBox="0 0 720 250" role="img" aria-label="Bounded authoring flow"><defs><marker id="parent-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>';
    svg+=edge('M165,45 H245')+edge('M395,45 H475')+edge('M550,70 V180')+edge('M475,205 H395','results',435,194)
      +edge('M298,180 V70','max 2 paths',225,125,true)+edge('M245,205 H165','limit reached',205,194);
    for(const [id,node]of Object.entries(parentNodes))svg+=`<g class="node ${node.kind==='person'?'person':''} ${visited[id]?'visited':''} ${active===id?'current':''}" data-parent="${id}" role="button" tabindex="0" aria-label="Inspect ${node.label}"><title>${esc(node.detail)}</title><rect x="${node.x}" y="${node.y}" width="150" height="50" rx="9"/><text x="${node.x+10}" y="${node.y+19}">${node.label}</text><text class="kind" x="${node.x+10}" y="${node.y+36}">${node.kind==='exact'?'exact logic':node.kind}</text></g>`;
    return svg+'</svg>';
  }
  function render(){
    const state=system.snapshot(),b=state.builder,run=state.current,path=state.path,{internal,external}=state.monitoring;
    if(run&&run.id!==lastRunId){el('ba-case').value=run.caseId;lastRunId=run.id;}
    el('ba-parent-graph').innerHTML=parentMarkup(state);
    el('ba-parent-detail').textContent=chosenParent?parentNodes[chosenParent].detail:'';
    el('ba-author').disabled=path.version>0;el('ba-author').textContent=path.version?`Created path v${path.version}`:'Build this flow';
    el('ba-status').textContent=notice||(path.version?`Path v${path.version}`:'');
    el('ba-created').hidden=!path.version;
    if(path.version){
      el('ba-child-title').textContent=`Support flow v${run?.pathVersion||path.version}`;
      el('ba-child-graph').innerHTML=window.boundedGraphMarkup(state,'child-arrow');
      const sample=BoundedModel.cases.find(item=>item.id===el('ba-case').value);
      el('ba-customer-request').textContent=sample.message;
      const busy=run&&['ready','running','review'].includes(run.status),canStart=b.runsUsed<b.maxRuns&&b.toolsUsed+2<=b.maxTools&&b.status!=='handoff';
      el('ba-case').disabled=Boolean(busy);el('ba-step').disabled=run?.status==='review'||(!busy&&!canStart);el('ba-run').disabled=el('ba-step').disabled;
      el('ba-inner-summary').textContent=internal?`${states[internal.status]} · ${internal.label} · ${internal.steps}/${run.path.limits.steps} steps · ${internal.lookups}/${internal.lookupLimit} lookups`:'Ready';
      el('ba-inner-event').textContent=(internal?.lastEvent?.result||'').replace(' Stopping instead of guessing.','').replace(' Every step stays on the case; no external system was changed.','');
      el('ba-review').hidden=run?.status!=='review';el('ba-draft').hidden=run?.status!=='review';el('ba-draft').textContent=run?.status==='review'?run.draft:'';
      el('ba-run-notice').textContent=notice;
    }
    el('ba-frame-goal').textContent=external.goal+'.';
    el('ba-frame-summary').textContent=external.summary.replace(/^1 authored runs:/,'1 authored run:')+(external.authoredRuns?external.limitsHeld?' Bounds and approval: pass.':' Bounds or approval: review required.':'');
    el('ba-frame-decision').textContent=b.status==='handoff'?b.observation:!path.version?'Ready to build.':run?.status==='review'?'Awaiting approval.':run&&['ready','running'].includes(run.status)?'Run in progress.':b.canRevise?'Lookup limit reached. Revision available.':external.authoredRuns?'Run recorded.':'Ready for first run.';
    const comparison=external.comparison;el('ba-frame-comparison').hidden=!comparison;
    el('ba-frame-comparison').textContent=comparison?`${comparison.before.pathId} → ${comparison.after.pathId} · steps ${comparison.before.steps} → ${comparison.after.steps} · lookups ${comparison.before.lookups} → ${comparison.after.lookups} · ${states[comparison.after.status].toLowerCase()}`:'';
    el('ba-frame-tradeoff').hidden=!external.tradeoff;el('ba-frame-tradeoff').textContent=external.tradeoff?'Earlier handoff: fewer lookups; more requests may need a person.':'';
    el('ba-revise').hidden=!b.canRevise;
    el('ba-budget').textContent=`Parent limits: ${b.toolsUsed}/${b.maxTools} tools · ${b.versionsUsed}/${b.maxVersions} paths · ${b.runsUsed}/${b.maxRuns} child runs`;
    if(!chosenPath||!state.paths.some(item=>item.id===chosenPath))chosenPath=path.id;
    el('ba-definition-pick').innerHTML=state.paths.map(item=>`<option value="${esc(item.id)}" ${item.id===chosenPath?'selected':''}>${esc(item.id)} · ${esc(item.createdBy)}</option>`).join('');
    el('ba-definition').textContent=JSON.stringify(state.paths.find(item=>item.id===chosenPath),null,2);
    el('ba-trace').innerHTML=b.trace.map(item=>`<li><strong>${esc(item.tool)}</strong> · ${esc(item.result)} · ${esc(item.detail)}</li>`).join('');
    el('ba-history').innerHTML=state.runs.map(item=>`<div>${esc(item.id)} · ${esc(item.pathId)} · ${esc(states[item.status])} · ${item.steps} steps</div>`).join('');
    window.canvasRedraw?.();
  }
  function ensureRun(){const state=system.snapshot();if(!state.current||terminal.has(state.current.status))system.start(el('ba-case').value);}
  el('ba-author').onclick=()=>perform(()=>{chosenPath=system.author({lookupLimit:3,revisionLimit:2}).id;});
  el('ba-step').onclick=()=>perform(()=>{ensureRun();system.step();});
  el('ba-run').onclick=()=>perform(()=>{ensureRun();system.runToStop();});
  el('ba-approve').onclick=()=>perform(()=>{system.decide(true);system.runToStop();});
  el('ba-back').onclick=()=>perform(()=>{system.decide(false);system.runToStop();});
  el('ba-revise').onclick=()=>perform(()=>{chosenPath=system.revise().id;});
  el('ba-reset').onclick=()=>perform(()=>{system.reset();chosenPath=null;chosenParent=null;lastRunId=null;});
  el('ba-case').onchange=render;el('ba-definition-pick').onchange=()=>{chosenPath=el('ba-definition-pick').value;render();};
  el('ba-parent-graph').onclick=event=>{const node=event.target.closest('[data-parent]');if(!node)return;chosenParent=node.dataset.parent;render();};
  el('ba-child-graph').onclick=event=>{const node=event.target.closest('[data-node]');if(!node)return;const s=system.snapshot(),id=node.dataset.node;el('ba-node-detail').textContent=`${BoundedModel.nodeCatalog[id].label} · ${BoundedModel.nodeCatalog[id].kind}. ${id==='gather'?`At most ${s.path.limits.gather} lookups before handoff.`:id==='confirm'?'Only a person can approve the draft.':`This step belongs to ${s.current?.pathId||s.path.id}.`}`;};
  for(const id of ['ba-parent-graph','ba-child-graph'])el(id).onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.target.closest('[data-parent],[data-node]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));}};
  el('ba-inspector').addEventListener('toggle',()=>window.canvasRedraw?.());
  system.subscribe(render);window.workflowDemo=system;render();
})();
