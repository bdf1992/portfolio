(function () {
  'use strict';
  if (!document.getElementById('workflow-workspace')) return;
  const fresh=()=>{const instance=AssistantModel.createEngine();instance.setGrant('read',true);return instance;};
  let engine=fresh(), selected=null, tab='result', selectedStep=0;
  const el=id=>document.getElementById(id);
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names={direct:'Direct tool help',automation:'Ordinary automation',delegate:'Agents authoring agents',clarification:'Clarify the request'};
  const statuses={ready:'Ready',running:'Working',blocked:'Needs permission',complete:'Answered',review:'Ready for review',accepted:'Accepted',rejected:'Rejected',needs_revision:'Check failed',budget_exhausted:'Action limit reached',clarification:'Choose an example'};
  const badge=status=>status==='complete'||status==='accepted'?'ok':['needs_revision','budget_exhausted','rejected'].includes(status)?'no':'wait';
  const examples={direct:'What is holding up the work in this business?',automation:'Automate a review list of items waiting more than five days.',delegate:'Build a specialist agent and workflow for handling customer issues in this business.'};
  const updateDescriptions={base:'Add a required policy citation to the worker workflow.',agent:'Require authored workers to cite the policy they used.',tool:'Change the sample policy window from 7 to 14 days.',execution:'Change the action budget for new requests.',customization:'Revise the saved local business instruction.',personalization:'Switch between concise and warm responses.'};
  function act(fn) {try {fn();render();}catch(error){el('ca-notice').textContent=error.message;}}
  function chooseWorkspace(id) {engine.selectWorkspace(id); selected=engine.snapshot().runs.filter(run=>run.workspaceId===id).at(-1)?.id||null;tab='result';el('ca-request').value='';}
  function ask(text) {act(()=>{selected=engine.submit(text).id;selectedStep=0;tab='result';el('ca-request').value='';if(!el('ca-step-mode').checked)engine.runToStop(selected);el('ca-notice').textContent='The request and any authored artifacts are kept with this run.';});}
  function recordsTable(records) {return `<table class="ca-records"><thead><tr><th>Item</th><th>Days</th><th>What it needs</th></tr></thead><tbody>${records.map(row=>`<tr><td><strong>${esc(row.id)}</strong><br>${esc(row.name)}</td><td>${row.ageDays}</td><td>${esc(row.reason)}</td></tr>`).join('')}</tbody></table>`;}
  function definitionCard(title,a) {
    return `<h5>${esc(title)}</h5><p><strong>${esc(a.id)}</strong> · authored by ${esc(a.createdBy)}</p><p class="small">${esc(a.instructions||a.localInstruction||'A deterministic filter with no agent.')}</p>
      ${a.allowedTools?`<p class="small muted">Tools: ${a.allowedTools.map(esc).join(', ')}<br>Conversation history: ${a.conversationHistory.length} messages<br>Scope: ${esc(a.workspaceId)}</p>`:''}
      ${a.nodes?`<ol class="ca-workflow-nodes">${a.nodes.map(node=>`<li>${esc({intake:'Load case',policy:'Read policy',draft:'Prepare draft',check:'Check citation',review:'Person reviews'}[node]||node)}</li>`).join('')}</ol>`:''}
      ${a.steps?`<ol class="ca-workflow-nodes">${a.steps.map(node=>`<li>${esc(node)}</li>`).join('')}</ol><p class="small muted">Scheduled: no. This example runs the rule on demand.</p>`:''}
      <details class="ca-json"><summary>Inspect the authored definition</summary><pre>${esc(JSON.stringify(a,null,2))}</pre></details>`;
  }
  function inspect(run) {
    const a=run?.artifacts||{}, choices=[['result','Result'],...['engineer','workflow','worker','automation','checks'].filter(key=>a[key]).map(key=>[key,{engineer:'Engineering agent',workflow:'Workflow',worker:'Worker agent',automation:'Rule',checks:'Checks'}[key]])];
    if(!choices.some(([key])=>key===tab))tab='result';
    el('ca-artifact-tabs').innerHTML=choices.map(([key,label])=>`<button class="btn small" data-tab="${key}" aria-pressed="${tab===key}">${label}</button>`).join('');
    el('ca-artifact-tabs').querySelectorAll('button').forEach(button=>button.onclick=()=>{tab=button.dataset.tab;render();});
    let content='<p class="muted small">Ask a question to see the tools used and anything the assistant creates.</p>';
    if(run&&tab==='result') {
      if(run.result?.records)content=`<h5>${run.path==='direct'?'What is waiting':'Review list from the saved rule'}</h5>${recordsTable(run.result.records)}<p class="small muted">Additional agents created: 0</p>`;
      else if(run.result?.output)content=`<h5>The authored worker’s result</h5><p class="small muted">${esc(run.result.workerId)} · created by ${esc(run.result.createdBy)}</p><p class="ca-result-text">${esc(run.result.output.text)}</p><p class="small">Local instruction: ${esc(run.result.output.focus)}</p><p class="small muted">The authored definition produced this draft. Nothing was sent.</p>`;
      else content=`<p class="small muted">${run.status==='needs_revision'?'The check caught a problem. Inspect Checks, then use that evidence to revise the agent.':'The result appears as the assistant uses its tools.'}</p>`;
    }
    if(run&&['engineer','workflow','worker','automation'].includes(tab))content=definitionCard({engineer:'Engineering agent authored by the assistant',workflow:'Workflow authored by the engineering agent',worker:'Business worker authored by the engineering agent',automation:'An ordinary automation'}[tab],a[tab]);
    if(run&&tab==='checks')content=`<h5>${a.checks.passed?'Checks passed':'Checks failed'}</h5><p class="small">Tool and workspace scope: ${a.checks.scopeContained?'contained':'refused'}<br>Actual sample execution: ${esc(a.checks.sampleStatus)}</p><p class="small muted">The check runs the authored definition and inspects the resulting behavior.</p>${a.checks.sampleOutput?`<p class="ca-result-text">${esc(a.checks.sampleOutput.text)}</p>`:''}`;
    el('ca-artifact').innerHTML=content;
  }
  function render() {
    const state=engine.snapshot(), w=state.workspaces[state.activeWorkspace], run=state.runs.find(item=>item.id===selected);
    el('ca-workspaces').innerHTML=Object.values(state.workspaces).map(item=>`<button class="btn" data-workspace="${item.id}" aria-pressed="${item.id===w.id}">${esc(item.name)}</button>`).join('');
    el('ca-workspaces').querySelectorAll('button').forEach(button=>button.onclick=()=>act(()=>chooseWorkspace(button.dataset.workspace)));
    el('ca-context').textContent=`${w.domain} · saved context v${w.contextVersion} · ${w.preferences.tone} personalization v${w.preferences.version}`;
    el('ca-thread').innerHTML=w.messages.map(m=>`<div class="ca-message ${m.role==='person'?'person':'assistant'}"><span class="ca-role">${m.role==='person'?'You':'Assistant'}${m.runId?` · ${esc(m.runId)}`:''}</span><p>${esc(m.text)}</p></div>`).join('');el('ca-thread').scrollTop=el('ca-thread').scrollHeight;
    ['read','write','execute'].forEach(key=>{el(`ca-grant-${key}`).checked=w.grants[key];});
    el('ca-grant-scope').textContent=`Live permissions for ${w.name}. This example starts with read access in the print workspace. Writing and execution need separate grants.`;
    el('ca-run-label').textContent=run?`${run.id} · ${names[run.path]}`:'No request yet';el('ca-status').className=`badge ${run?badge(run.status):'exact'}`;el('ca-status').textContent=run?statuses[run.status]:'Ready';
    el('ca-lineage').innerHTML=`<span>You</span><span>Assistant</span>${run?.artifacts.engineer?'<button data-target="engineer">Engineering agent</button>':''}${run?.artifacts.worker?'<button data-target="worker">Business worker</button>':''}`;
    el('ca-lineage').querySelectorAll('button').forEach(button=>button.onclick=()=>{tab=button.dataset.target;render();});
    el('ca-agent-count').textContent=run?.path==='delegate'?`${Number(Boolean(run.artifacts.engineer))+Number(Boolean(run.artifacts.worker))} specialist definitions created`:'No additional agent required';
    el('ca-plan').innerHTML=run?run.plan.map(([actor,tool,title],i)=>{const entry=run.trace.filter(e=>e.position===i&&e.tool===tool).at(-1);return `<li><button data-step="${i}" class="${run.position===i?'current':''}" aria-pressed="${selectedStep===i}"><span class="ca-step-number">${i+1}</span><span><strong>${esc(title)}</strong><small>${esc(actor)} · ${esc(tool)}</small></span><span class="badge ${entry?.result==='failed'||entry?.result==='refused'?'no':'exact'}">${esc(entry?.result||'pending')}</span></button></li>`;}).join(''):'<li class="small muted">The plan follows the request. Direct help uses tools without spawning a worker.</li>';
    el('ca-plan').querySelectorAll('button').forEach(button=>button.onclick=()=>{selectedStep=Number(button.dataset.step);const tool=run.plan[selectedStep][1];tab=tool==='workflow.define'?'workflow':tool==='checks.run'?'checks':tool==='automation.define'?'automation':tool==='agents.define'?(run.plan[selectedStep][0]==='Assistant'?'engineer':'worker'):'result';render();});
    const tool=run?.plan[selectedStep]?.[1],entry=run?.trace.filter(item=>item.position===selectedStep&&item.tool===tool).at(-1);el('ca-step-detail').textContent=entry?.detail||'Select a step to inspect its tool result and anything it created.';
    const runnable=run&&['ready','running','blocked'].includes(run.status);el('ca-next').disabled=!runnable;el('ca-continue').disabled=!runnable;el('ca-accept').disabled=run?.status!=='review';el('ca-reject').disabled=run?.status!=='review';el('ca-improve').hidden=run?.status!=='needs_revision'||run?.artifacts.checks?.sampleStatus!=='needs_revision';
    el('ca-trace-count').textContent=run?`Tool trace · ${run.trace.length} events · ${run.actions}/${run.pins.components.execution.maxActions} actions`:'Tool trace';
    el('ca-trace').innerHTML=run?run.trace.map(e=>`<li><strong>${esc(e.actor)}</strong> → <code>${esc(e.tool)}</code> <span class="badge ${e.result==='failed'||e.result==='refused'?'no':'exact'}">${esc(e.result)}</span><p>${esc(e.detail)}</p><small>Live grant revision ${e.grantRevision}</small></li>`).join(''):'<li>No tools have run.</li>';
    el('ca-child-trace').innerHTML=run?.artifacts.execution?`<details><summary>Business worker execution</summary><ol>${run.artifacts.execution.trace.map(e=>`<li><strong>${esc(e.actor)} · ${esc(e.node)}</strong><p>${esc(e.detail)}</p></li>`).join('')}</ol></details>`:'';
    const vector=run?engine.versions(run.workspaceId):null;el('ca-versions').innerHTML=run?Object.entries(run.versions).map(([key,value])=>`<div><span>${AssistantModel.labels[key]}</span><b>v${value}</b><span class="small muted">${vector[key]!==value?`v${vector[key]} available`:'current'}</span></div>`).join(''):'<p class="small muted">Each request retains its starting versions and authored definitions.</p>';
    el('ca-update-description').textContent=updateDescriptions[el('ca-component').value];
    el('ca-history').innerHTML=state.runs.length?state.runs.slice().reverse().map(item=>`<button data-run="${item.id}" aria-pressed="${item.id===selected}"><strong>${item.id} · ${esc(item.workspaceName)}</strong><span class="badge ${badge(item.status)}">${statuses[item.status]}</span><small>${names[item.path]}${item.parentId?` · revised from ${item.parentId}`:''}<br>Base ${item.versions.base} · Agent ${item.versions.agent} · Tool ${item.versions.tool} · Context ${item.versions.customization} · Preference ${item.versions.personalization}</small></button>`).join(''):'<p class="small muted">Earlier requests and their artifacts stay available here.</p>';
    el('ca-history').querySelectorAll('button').forEach(button=>button.onclick=()=>act(()=>{selected=button.dataset.run;engine.selectWorkspace(state.runs.find(item=>item.id===selected).workspaceId);tab='result';selectedStep=0;}));
    inspect(run);window.canvasRedraw?.();
  }
  el('ca-form').onsubmit=e=>{e.preventDefault();ask(el('ca-request').value);};document.querySelectorAll('[data-example]').forEach(button=>button.onclick=()=>ask(examples[button.dataset.example]));
  ['read','write','execute'].forEach(key=>el(`ca-grant-${key}`).onchange=()=>act(()=>{engine.setGrant(key,el(`ca-grant-${key}`).checked);el('ca-notice').textContent='Permission changed for this workspace. Continue the request to retry its next tool.';}));
  el('ca-next').onclick=()=>act(()=>{const run=engine.advance(selected);selectedStep=Math.min(run.position,run.plan.length-1);});
  el('ca-continue').onclick=()=>act(()=>{const run=engine.runToStop(selected);selectedStep=Math.min(run.position,run.plan.length-1);tab=run.status==='needs_revision'?'checks':'result';});
  el('ca-improve').onclick=()=>act(()=>{selected=engine.reviseFromEvidence(selected).id;if(!el('ca-step-mode').checked)engine.runToStop(selected);selectedStep=0;tab='result';el('ca-notice').textContent='The assistant used the failed output to revise the agent instructions. The earlier run is preserved.';});
  el('ca-accept').onclick=()=>act(()=>engine.review(selected,true));el('ca-reject').onclick=()=>act(()=>engine.review(selected,false));el('ca-component').onchange=render;
  el('ca-update').onclick=()=>act(()=>{engine.updateComponent(el('ca-component').value);el('ca-notice').textContent='Updated for new requests. Existing requests retain their definitions and versions.';});
  el('ca-reset').onclick=()=>{engine=fresh();selected=null;tab='result';selectedStep=0;el('ca-component').value='base';el('ca-request').value='';el('ca-step-mode').checked=false;el('ca-notice').textContent='Choose a sample request or write one using the example vocabulary.';render();};
  window.workflowDemo={snapshot:()=>engine.snapshot(),submit:text=>engine.submit(text),advance:id=>engine.advance(id),render};render();
})();
