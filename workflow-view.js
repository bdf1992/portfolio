(function () {
  'use strict';
  if(!document.getElementById('workflow-workspace'))return;
  const el=id=>document.getElementById(id);
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const engine=AssistantModel.createEngine();engine.selectWorkspace('intake');
  for(const kind of ['read','write','execute'])engine.setGrant(kind,true);
  let selected=null,artifact='workflow',shown=null,rowIndex=0,customCount=0,stale=false;
  const current=()=>engine.snapshot().runs.find(run=>run.id===selected);
  function inspect(){
    const run=current();
    el('ti-definition').textContent=run?JSON.stringify(run.artifacts[artifact],null,2):'Build the workflow to inspect its definition.';
    el('ti-trace').innerHTML=run?run.trace.map(item=>`<li>${esc(item.actor)} · ${esc(item.tool)} · ${esc(item.result)}</li>`).join(''):'';
  }
  function render(){
    const run=current();el('ti-built').hidden=!run;
    if(run){
      const flow=run.artifacts.workflow;
      el('ti-title').textContent=`Intake triage · version ${flow.id.split('-').at(-1)}`;
      const panels={
        rules:()=>`<section><h4>Authored routing · first matching rule wins</h4><ol class="ti-rules">${flow.rules.map(rule=>`<li>${esc(rule.label)}</li>`).join('')}<li>Anything else → ${esc(flow.fallback.queue)}</li></ol></section>`,
        results:()=>`<section><h4>${shown.rows.length} intake ${shown.rows.length===1?'executed':'submissions executed'} · ${esc(shown.id)}</h4><div class="ti-results">${shown.rows.map((row,index)=>`<button class="ti-result" data-result="${index}" aria-pressed="${index===rowIndex}"><strong>${esc(row.input.summary||'No request details')}</strong><small class="${row.priority==='Urgent'?'urgent':''}">${esc(row.input.id)} · ${esc(row.queue)} · ${esc(row.priority==='Unassigned'?row.status:row.priority)}</small></button>`).join('')}</div><p id="ti-reason" aria-live="polite"></p></section>`
      };
      el('ti-panels').innerHTML=flow.surface.panels.map(key=>panels[key]()).join('');
      el('ti-panels').querySelectorAll('[data-result]').forEach(button=>button.onclick=()=>{rowIndex=Number(button.dataset.result);render();});
      const row=shown.rows[rowIndex];el('ti-reason').textContent=`Why: ${row.reason}.`;
      el('ti-submit').disabled=stale;
    }
    inspect();window.canvasRedraw?.();
  }
  el('ti-build').onclick=()=>{
    try{
      engine.saveIntakeRequirements({supportQueue:el('ti-team').value,requireContact:el('ti-contact').checked});
      const run=engine.runToStop(engine.submit('Build a triage workflow for our new shared intake.').id);
      if(run.status!=='complete')throw new Error('The workflow did not reach execution.');
      selected=run.id;shown=run.executions[0];rowIndex=0;stale=false;
      el('ti-status').textContent='The engineering agent authored the workflow. The assistant ran its rules on three new requests.';
      el('ti-build').textContent='Build a new version';el('ti-execution').textContent='Select a result to see why it took that route.';render();
    }catch(error){el('ti-status').textContent=error.message;}
  };
  function requirementsChanged(){
    stale=Boolean(selected);el('ti-status').textContent=selected?'Requirements changed. Build a new version to apply them.':'Ready to build with these requirements.';render();
  }
  el('ti-team').onchange=requirementsChanged;el('ti-contact').onchange=requirementsChanged;
  el('ti-form').onsubmit=event=>{
    event.preventDefault();
    try{
      if(stale)throw new Error('Build the changed requirements first.');
      shown=engine.runIntake(selected,[{id:`Try-${++customCount}`,summary:el('ti-summary').value,contact:el('ti-person').value,category:el('ti-category').value,impact:el('ti-stopped').checked?'stopped':'normal'}]);rowIndex=0;
      el('ti-execution').textContent=`Executed against ${current().artifacts.workflow.id}. No live ticket was created.`;render();
    }catch(error){el('ti-execution').textContent=error.message;}
  };
  document.querySelectorAll('[data-artifact]').forEach(button=>button.onclick=()=>{artifact=button.dataset.artifact;inspect();});
  el('ti-inspector').addEventListener('toggle',()=>window.canvasRedraw?.());
  document.querySelector('.ti-custom').addEventListener('toggle',()=>window.canvasRedraw?.());
  window.workflowDemo={snapshot:()=>engine.snapshot(),render};render();
})();
