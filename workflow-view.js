(function () {
  'use strict';
  if (!document.getElementById('workflow-workspace')) return;
  const el=id=>document.getElementById(id);
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let engine,selected,artifact='workflow';
  function current(){return engine.snapshot().runs.find(run=>run.id===selected);}
  function reset(){
    engine=AssistantModel.createEngine();
    for(const kind of ['read','write','execute'])engine.setGrant(kind,true);
    selected=engine.submit('Build a review tool and a worker agent for customer reprint requests.').id;
    engine.runToStop(selected);artifact='workflow';
    el('rt-inspector').open=false;el('rt-other-result').textContent='';render();
  }
  function inspect(){
    const run=current();
    el('rt-artifact-tabs').innerHTML=[['workflow','Screen + workflow'],['engineer','Engineering agent'],['worker','Business worker']].map(([key,label])=>`<button class="btn small" data-artifact="${key}" aria-pressed="${key===artifact}">${label}</button>`).join('');
    el('rt-artifact-tabs').querySelectorAll('button').forEach(button=>button.onclick=()=>{artifact=button.dataset.artifact;inspect();});
    el('rt-definition').textContent=JSON.stringify(run.artifacts[artifact],null,2);
    el('rt-trace').innerHTML=run.trace.map(item=>`<li><strong>${esc(item.actor)}</strong> · ${esc(item.tool)} · ${esc(item.result)}</li>`).join('');
  }
  function render(){
    const run=current(),sample=run.pins.workspace.case,surface=run.artifacts.workflow.surface;
    const awaiting=run.status==='review';
    el('rt-case-title').textContent=`${sample.customer} · ${sample.id}`;
    el('rt-case-detail').textContent=`${sample.quantity} menus · delivered ${sample.ageDays} days ago · customer reports the wrong price`;
    el('rt-status').textContent=awaiting?'Needs your review':run.status==='accepted'?'Draft approved':'Sent back';
    const panels={
      'source-files':()=>`<div class="rt-files" aria-label="Sample proof comparison">${['approved','delivered'].map(key=>{const file=sample[key];return `<section class="rt-file"><h4>${esc(file.name)}</h4><div class="rt-proof"><strong>Harbor Street<br>Bakery</strong><p>${esc(file.item)} <b>${esc(file.price)}</b></p></div></section>`;}).join('')}</div>`,
      reply:()=>`<div class="rt-reply"><label for="rt-draft">Reply to the customer</label><textarea id="rt-draft" maxlength="1000" rows="3" ${awaiting?'':'readonly'}>${esc(run.result.output.text)}</textarea><p class="rt-policy">Sample policy: ${run.artifacts.execution.policy.windowDays}-day window. This request needs a person’s decision.</p></div>`
    };
    el('rt-panels').innerHTML=surface.panels.map(key=>panels[key]()).join('');
    const actions={'approve-draft':['Approve draft','primary',true],'send-back':['Send back','',false]};
    el('rt-actions').innerHTML=surface.actions.map(key=>{const [label,style]=actions[key];return `<button class="btn ${style}" data-action="${key}" ${awaiting&&surface.humanApproval?'':'disabled'}>${label}</button>`;}).join('');
    el('rt-actions').querySelectorAll('button').forEach(button=>button.onclick=()=>{
      const text=el('rt-draft').value;
      try{
        if(text!==current().result.output.text&&(text.trim()||actions[button.dataset.action][2]))engine.editDraft(selected,text);
        engine.review(selected,actions[button.dataset.action][2]);render();
      }catch(error){el('rt-notice').textContent=error.message;}
    });
    el('rt-notice').textContent=awaiting?'Edit the draft before approving. This example sends no messages.':run.status==='accepted'?'Draft approved in this example. Nothing was sent.':'Draft returned for revision. Nothing was sent.';
    inspect();window.canvasRedraw?.();
  }
  function other(text){
    try{
      const result=engine.runToStop(engine.submit(text).id),records=result.result.records;
      el('rt-other-result').textContent=`${result.path==='direct'?'Read directly from the workspace':'Ordinary rule: waiting more than five days'}: ${records.map(item=>`${item.id} — ${item.reason}`).join('; ')}. No additional agent.`;
    }catch(error){el('rt-other-result').textContent=error.message;}
    window.canvasRedraw?.();
  }
  el('rt-reset').onclick=reset;
  el('rt-direct').onclick=()=>other('What is waiting?');
  el('rt-rule').onclick=()=>other('Flag work waiting over five days.');
  el('rt-inspector').addEventListener('toggle',()=>window.canvasRedraw?.());
  el('rt-inspector').querySelectorAll('details').forEach(details=>details.addEventListener('toggle',()=>window.canvasRedraw?.()));
  window.workflowDemo={snapshot:()=>engine.snapshot(),render};reset();
})();
