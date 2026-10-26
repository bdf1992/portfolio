(function () {
  'use strict';
  const host = document.getElementById('workflow-workspace');
  if (!host) return;
  let engine = WorkflowModel.createEngine(), selectedRun = null, selectedNode = 'intake';
  const byId = id => document.getElementById(id);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const names = { intake:'Load context', policy:'Read policy', draft:'Prepare draft', check:'Check evidence', review:'Person reviews' };
  const nodeDetails = {
    intake: 'The fresh agent loads this workspace’s saved case, instructions, personalization and pinned versions. Conversation history starts empty.',
    policy: 'The policy tool can run only under a live read grant for this workspace. Its pinned version decides the remedy window.',
    draft: 'The agent combines the case, tool result, customization and personalization. A live draft grant is required.',
    check: 'The updated base requires the draft to cite the policy used. Updating the base can expose a gap in the agent instructions.',
    review: 'A person accepts or rejects the result. Acceptance does not send it or give the agent another permission.'
  };
  const statusLabel = { ready:'Ready', running:'Running', blocked:'Needs a grant', review:'Needs review', accepted:'Draft accepted', rejected:'Draft rejected', needs_revision:'Evidence check failed', budget_exhausted:'Attempt limit reached' };
  const statusClass = status => status === 'accepted' ? 'ok' : ['needs_revision','budget_exhausted','rejected'].includes(status) ? 'no' : 'wait';
  function fillForm() {
    const state = engine.snapshot(), w = state.workspaces[state.activeWorkspace];
    byId('wf-request').value = w.customization.request;
    byId('wf-focus').value = w.customization.focus;
    byId('wf-channel').value = w.customization.channel;
    byId('wf-tone').value = w.personalization.tone;
    byId('wf-save-state').textContent = 'Saved definition is ready for a fresh agent.';
  }
  function notice(text) { byId('wf-notice').textContent = text; }
  function act(fn) {
    try { fn(); render(); } catch (error) { notice(error.message); }
  }
  function render() {
    const state = engine.snapshot(), w = state.workspaces[state.activeWorkspace];
    const run = state.runs.find(item => item.id === selectedRun);
    const versions = engine.versions(run ? run.workspaceId : w.id);
    byId('wf-workspaces').innerHTML = Object.values(state.workspaces).map(item => `<button class="btn" data-workspace="${item.id}" aria-pressed="${item.id === w.id}">${escape(item.name)}</button>`).join('');
    byId('wf-workspaces').querySelectorAll('button').forEach(button => button.onclick = () => act(() => {
      engine.selectWorkspace(button.dataset.workspace); selectedRun=engine.snapshot().runs.filter(item=>item.workspaceId===button.dataset.workspace).at(-1)?.id || null; fillForm();
      notice('Workspace loaded. Its definition and grants are separate from the other business.');
    }));
    byId('wf-definition-version').textContent = `Customization v${w.customization.version} · Personalization v${w.personalization.version}`;
    ['read','draft'].forEach(key => { byId(`wf-grant-${key}`).checked = w.grants[key]; });
    byId('wf-grant-scope').textContent = `Permissions apply to ${w.name} only. Checked again at each permitted action.`;
    byId('wf-components').innerHTML = ['base','agent','tool','execution'].map(key => `<span>${escape(WorkflowModel.labels[key])} <b>v${state[key].version}</b></span>`).join('');
    byId('wf-update-description').textContent = ({base:'Adds a policy-citation check to the base workflow.',agent:'Requires the agent to cite the policy version it used.',tool:'Changes the invented remedy window from 7 to 14 days.',execution:`Changes the attempt budget. Next version allows ${state.execution.version % 2 === 1 ? 2 : 12} attempts.`})[byId('wf-component').value];
    const nodes = run ? run.nodes : ['intake','policy','draft',...(state.base.checksRequired ? ['check'] : []),'review'];
    if (!nodes.includes(selectedNode)) selectedNode = nodes[0];
    byId('wf-graph').innerHTML = nodes.map((key,index) => {
      const nodeEvents = run ? run.trace.filter(e => e.node === key) : [];
      const last = nodeEvents.at(-1);
      const failed = last && ['failed','no grant','stopped'].includes(last.result);
      const done = run && index < run.position;
      const current = run && index === Math.min(run.position, nodes.length - 1);
      return `<li><button class="wf-node ${done?'done':''} ${current?'current':''} ${failed?'failed':''}" data-node="${key}" aria-pressed="${key === selectedNode}"><span class="wf-node-kind">${key === 'review' ? 'Person' : key === 'policy' ? 'Tool' : key === 'check' ? 'Evaluator' : 'Agent'}</span><strong>${names[key]}</strong><span>${last ? escape(last.result) : 'Not run'}</span></button></li>`;
    }).join('');
    byId('wf-graph').querySelectorAll('button').forEach(button => button.onclick = () => { selectedNode = button.dataset.node; render(); });
    byId('wf-node-title').textContent = names[selectedNode];
    const events = run ? run.trace.filter(e => e.node === selectedNode) : [];
    byId('wf-node-detail').textContent = events.length ? events.at(-1).detail : nodeDetails[selectedNode];
    byId('wf-run-label').textContent = run ? `${run.id} · ${run.workspaceName}` : 'Start a fresh agent';
    byId('wf-status').className = `badge ${run ? statusClass(run.status) : 'exact'}`;
    byId('wf-status').textContent = run ? statusLabel[run.status] : 'No run yet';
    byId('wf-versions').innerHTML = run ? Object.entries(run.versions).map(([key,value]) => `<div><span>${escape(WorkflowModel.labels[key])}</span><b>v${value}</b>${versions[key] !== value ? `<span class="badge wait">v${versions[key]} available</span>` : '<span class="wf-current-label">current</span>'}</div>`).join('') : '<p class="muted small">Each run records the base, agent, tool, execution rule, customization and personalization it actually uses.</p>';
    byId('wf-packet').textContent = run ? `${run.packet.domain} · ${run.packet.channel} · ${run.packet.tone}\n${run.packet.request}\nLocal instruction: ${run.packet.focus}\nConversation history: 0 messages\nGrant scope: ${run.workspaceName}` : 'A cold agent has no previous conversation. Start one to see the saved context it receives.';
    const runnable = run && ['ready','running','blocked'].includes(run.status);
    byId('wf-step').disabled = !runnable; byId('wf-run').disabled = !runnable;
    byId('wf-accept').disabled = !run || run.status !== 'review';
    byId('wf-reject').disabled = !run || run.status !== 'review';
    byId('wf-send').disabled = !run;
    byId('wf-output').textContent = run && run.output ? `${run.output.channel} draft\n${run.output.text}\n\nWorkspace instruction: ${run.output.focus}` : 'The draft will appear here. Nothing is sent from this example.';
    byId('wf-attempts').textContent = run ? `${run.attempts} / ${run.pins.execution.maxAttempts} attempts used · ${run.trace.length} recorded events` : 'Node results, grant checks and review decisions are recorded as the run progresses.';
    byId('wf-trace').innerHTML = run ? run.trace.map(event => `<li><span class="wf-event-number">${event.sequence.toString().padStart(2,'0')}</span><div><strong>${escape(event.actor)} · ${escape(names[event.node] || event.node)}</strong> <span class="badge ${['failed','refused','no grant','stopped'].includes(event.result)?'no':'exact'}">${escape(event.result)}</span><p>${escape(event.detail)}</p><small>Live grant revision ${event.grantRevision}</small></div></li>`).join('') : '<li class="muted">No run has started.</li>';
    byId('wf-history').innerHTML = state.runs.length ? state.runs.slice().reverse().map(item => `<button class="wf-history-item" data-run="${item.id}" aria-pressed="${item.id === selectedRun}"><strong>${item.id} <span>${escape(item.workspaceName)}</span></strong><span class="badge ${statusClass(item.status)}">${statusLabel[item.status]}</span><span class="small muted">Base ${item.versions.base} · Agent ${item.versions.agent} · Tool ${item.versions.tool} · Definition ${item.versions.customization} · Preference ${item.versions.personalization}</span></button>`).join('') : '<p class="muted small">Earlier runs stay available here. Updating a component does not rewrite them.</p>';
    byId('wf-history').querySelectorAll('button').forEach(button => button.onclick = () => { selectedRun = button.dataset.run; const item=state.runs.find(run=>run.id===selectedRun); engine.selectWorkspace(item.workspaceId); fillForm(); render(); });
    window.canvasRedraw?.();
  }
  byId('wf-save').onclick = () => act(() => {
    engine.saveCustomization({request:byId('wf-request').value,focus:byId('wf-focus').value,channel:byId('wf-channel').value,tone:byId('wf-tone').value});
    fillForm(); notice('Saved. A new run will use this definition; existing runs keep their versions.');
  });
  ['wf-request','wf-focus','wf-channel','wf-tone'].forEach(id => byId(id).oninput = () => { byId('wf-save-state').textContent = 'Unsaved edits. Save before starting an agent.'; });
  ['read','draft'].forEach(key => byId(`wf-grant-${key}`).onchange = () => act(() => {
    engine.setGrant(key,byId(`wf-grant-${key}`).checked);
    notice('Live permission changed for this workspace. Existing runs check it again at the next relevant action.');
  }));
  byId('wf-start').onclick = () => act(() => {
    const w = engine.snapshot().workspaces[engine.snapshot().activeWorkspace];
    if (byId('wf-request').value.trim() !== w.customization.request || byId('wf-focus').value.trim() !== w.customization.focus || byId('wf-channel').value !== w.customization.channel || byId('wf-tone').value !== w.personalization.tone) throw new Error('Save the workspace edits before starting a fresh agent.');
    selectedRun = engine.startRun().id; selectedNode='intake';
    notice('Fresh agent started with a pinned context packet and no conversation history.');
  });
  byId('wf-step').onclick = () => act(() => { const run=engine.step(selectedRun); selectedNode=run.trace.at(-1).node; });
  byId('wf-run').onclick = () => act(() => { const run=engine.runToStop(selectedRun); selectedNode=run.nodes[Math.min(run.position,run.nodes.length-1)]; });
  byId('wf-accept').onclick = () => act(() => { engine.review(selectedRun,true); notice('A person accepted this draft. Nothing was sent.'); });
  byId('wf-reject').onclick = () => act(() => { engine.review(selectedRun,false); notice('Draft rejected. Its evidence remains available for the next revision.'); });
  byId('wf-send').onclick = () => act(() => { engine.trySend(selectedRun); notice('Refused: preparing a draft does not grant permission to send it.'); });
  byId('wf-component').onchange = render;
  byId('wf-update').onclick = () => act(() => {
    const kind=byId('wf-component').value, next=engine.updateComponent(kind);
    notice(`${WorkflowModel.labels[kind]} v${next.version} is ready for new runs. Existing runs retain their pinned version.`);
  });
  byId('wf-reset').onclick = () => { engine=WorkflowModel.createEngine(); selectedRun=null; selectedNode='intake'; fillForm(); notice('Example reset. No saved company data is involved.'); render(); };
  window.workflowDemo = { snapshot:()=>engine.snapshot(), start:()=>engine.startRun(), step:id=>engine.step(id), render };
  fillForm(); render();
})();
