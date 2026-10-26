/* Browser-local workflow model. Agents, policies and business data are simulated. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorkflowModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const terminal = new Set(['accepted', 'rejected', 'needs_revision', 'budget_exhausted']);
  const labels = { base: 'Base workflow', agent: 'Agent instructions', tool: 'Policy tool', execution: 'Execution rule', customization: 'Customization', personalization: 'Personalization' };
  function evaluateDraft(output, policy) {
    const expected = `Source: policy v${policy.version}, ${policy.windowDays}-day window.`;
    return { ok: typeof output?.text === 'string' && output.text.includes(expected) };
  }
  function validateWorkflow(nodes) {
    const known=['intake','policy','draft','check','review'];
    return Array.isArray(nodes) && nodes.length>=4 && nodes.length<=5 && new Set(nodes).size===nodes.length
      && nodes.every(node=>known.includes(node)) && nodes[0]==='intake' && nodes.at(-1)==='review'
      && nodes.includes('policy') && nodes.includes('draft') && nodes.indexOf('policy')<nodes.indexOf('draft')
      && (!nodes.includes('check') || nodes.indexOf('check')>nodes.indexOf('draft'));
  }
  function createEngine(options={}) {
    if (options.nodes && !validateWorkflow(options.nodes)) throw new Error('Invalid authored workflow');
    const authoredNodes=options.nodes?copy(options.nodes):null;
    const state = {
      activeWorkspace: 'print', sequence: 0, runs: [], updates: [],
      base: { version: 1, name: 'Resolve a customer request', checksRequired: false },
      agent: { version: 1, instruction: 'Prepare a response using the case and policy.', citePolicy: false },
      tool: { version: 1, name: 'Look up the service policy', windowDays: 7 },
      execution: { version: 1, maxAttempts: 12 },
      workspaces: {
        print: { id: 'print', name: 'Print shop', domain: 'Print production',
          customization: { version: 1, request: 'The delivered menus do not match the approved proof.', channel: 'Email', focus: 'Check the approved proof before offering a reprint.' },
          personalization: { version: 1, tone: 'concise' },
          grants: { read: false, draft: false, revision: 1 } },
        field: { id: 'field', name: 'Field service', domain: 'Equipment service',
          customization: { version: 1, request: 'The repaired unit has stopped working again.', channel: 'Customer portal', focus: 'Check the service record before offering a return visit.' },
          personalization: { version: 1, tone: 'warm' },
          grants: { read: false, draft: false, revision: 1 } }
      }
    };
    function workspace(id = state.activeWorkspace) {
      if (!state.workspaces[id]) throw new Error('Unknown workspace');
      return state.workspaces[id];
    }
    function runById(id) {
      const run = state.runs.find(item => item.id === id);
      if (!run) throw new Error('Unknown run');
      return run;
    }
    function event(run, actor, node, result, detail) {
      run.trace.push({ sequence: run.trace.length + 1, actor, node, result, detail,
        grantRevision: workspace(run.workspaceId).grants.revision });
    }
    function versions(id = state.activeWorkspace) {
      const w = workspace(id);
      return { base: state.base.version, agent: state.agent.version, tool: state.tool.version,
        execution: state.execution.version, customization: w.customization.version,
        personalization: w.personalization.version };
    }
    function selectWorkspace(id) { workspace(id); state.activeWorkspace = id; }
    function saveCustomization(patch) {
      const w = workspace();
      const fields = ['request', 'channel', 'focus'];
      const next = { ...w.customization };
      fields.forEach(key => {
        if (patch[key] !== undefined) {
          const value = String(patch[key]).trim();
          if (!value || value.length > 500) throw new Error('Use between 1 and 500 characters');
          if (key === 'channel' && !['Email', 'Customer portal'].includes(value)) throw new Error('Unknown channel');
          next[key] = value;
        }
      });
      if (patch.tone !== undefined && !['concise', 'warm'].includes(patch.tone)) throw new Error('Unknown tone');
      if (fields.some(key => next[key] !== w.customization[key])) {
        next.version++; w.customization = next;
      }
      if (patch.tone && patch.tone !== w.personalization.tone) {
        w.personalization = { version: w.personalization.version + 1, tone: patch.tone };
      }
      return versions();
    }
    function setGrant(kind, on) {
      if (!['read', 'draft'].includes(kind) || typeof on !== 'boolean') throw new Error('Unknown grant');
      const w = workspace();
      if (w.grants[kind] !== on) { w.grants[kind] = on; w.grants.revision++; }
    }
    function updateComponent(kind) {
      if (!['base', 'agent', 'tool', 'execution'].includes(kind)) throw new Error('Unknown component');
      const previous = state[kind].version;
      const next = { ...state[kind], version: previous + 1 };
      if (kind === 'base') next.checksRequired = true;
      if (kind === 'agent') { next.citePolicy = true; next.instruction = 'Prepare a response and cite the policy version that supports it.'; }
      if (kind === 'tool') next.windowDays = 14;
      if (kind === 'execution') next.maxAttempts = next.version % 2 === 0 ? 2 : 12;
      state[kind] = next;
      state.updates.push({ kind, from: previous, to: next.version });
      return copy(next);
    }
    function startRun() {
      if (state.runs.length >= 20) throw new Error('Reset the example before starting more runs');
      if (authoredNodes && state.base.checksRequired && !authoredNodes.includes('check')) throw new Error('The authored workflow omits the required base check');
      const w = workspace();
      const pins = copy({ base: state.base, agent: state.agent, tool: state.tool,
        execution: state.execution, customization: w.customization, personalization: w.personalization });
      const run = { id: `Run ${++state.sequence}`, workspaceId: w.id, workspaceName: w.name,
        versions: versions(), pins, status: 'ready', position: 0, attempts: 0,
        nodes: authoredNodes?copy(authoredNodes):['intake', 'policy', 'draft', ...(pins.base.checksRequired ? ['check'] : []), 'review'],
        packet: { domain: w.domain, request: pins.customization.request, focus: pins.customization.focus,
          channel: pins.customization.channel, tone: pins.personalization.tone, conversationHistory: [],
          grantScope: w.id, grantsAtStart: copy(w.grants) }, output: null, policy: null, trace: [] };
      event(run, 'person', 'intake', 'dispatched', 'A new agent receives the saved definition and versioned context. No conversation history is carried in.');
      state.runs.push(run);
      return copy(run);
    }
    function step(id) {
      const run = runById(id);
      if (terminal.has(run.status) || run.status === 'review') return copy(run);
      if (run.attempts >= run.pins.execution.maxAttempts) {
        run.status = 'budget_exhausted';
        event(run, 'runtime', run.nodes[run.position], 'stopped', 'The pinned attempt limit was reached. Change the execution rule and start a new run.');
        return copy(run);
      }
      run.attempts++;
      const node = run.nodes[run.position];
      const grants = workspace(run.workspaceId).grants;
      const required = node === 'policy' ? 'read' : node === 'draft' ? 'draft' : null;
      if (required && !grants[required]) {
        run.status = 'blocked';
        event(run, 'runtime', node, 'no grant', `The ${run.workspaceName} workspace has no live ${required} grant. Nothing was executed at this node.`);
        return copy(run);
      }
      run.status = 'running';
      if (node === 'intake') event(run, 'agent', node, 'loaded', `${run.packet.domain}: ${run.packet.request} ${run.packet.focus}`);
      if (node === 'policy') {
        const eligible = 10 <= run.pins.tool.windowDays;
        run.policy = { version: run.pins.tool.version, windowDays: run.pins.tool.windowDays, ageDays: 10, eligible };
        event(run, 'tool', node, 'read', `Invented case age: 10 days. Policy v${run.policy.version} allows ${run.policy.windowDays} days. ${eligible ? 'Eligible for a no-charge remedy.' : 'Request a review before promising a no-charge remedy.'}`);
      }
      if (node === 'draft') {
        const remedy = run.workspaceId === 'print' ? 'a reprint' : 'a return visit';
        const opening = run.packet.tone === 'warm' ? 'Thanks for letting us know. I understand this has caused disruption. ' : '';
        const decision = run.policy.eligible ? `We can arrange ${remedy} at no charge, subject to confirmation of the case details.` : `We will review the case details before confirming ${remedy} at no charge.`;
        const citation = run.pins.agent.citePolicy ? ` Source: policy v${run.policy.version}, ${run.policy.windowDays}-day window.` : '';
        run.output = { channel: run.packet.channel, text: `${opening}${decision}${citation}`, focus: run.packet.focus,
          citation: run.pins.agent.citePolicy, sent: false };
        event(run, 'agent', node, 'drafted', `${run.output.channel} draft prepared using ${run.packet.tone} personalization. ${run.output.text}`);
      }
      if (node === 'check') {
        const ok = evaluateDraft(run.output, run.policy).ok;
        event(run, 'evaluator', node, ok ? 'passed' : 'failed', ok ? 'The draft names the policy version used. It remains unsent and awaits a person.' : 'Base v2 requires a policy citation. The pinned agent instructions did not produce one. Update the agent and start another run.');
        if (!ok) { run.status = 'needs_revision'; return copy(run); }
      }
      if (node === 'review') {
        run.status = 'review';
        event(run, 'runtime', node, 'waiting', 'A person must accept or reject the draft. The agent has no send grant.');
      }
      run.position++;
      return copy(run);
    }
    function runToStop(id) {
      let run;
      do { run = step(id); } while (run.status === 'running' || run.status === 'ready');
      return run;
    }
    function review(id, accepted) {
      const run = runById(id);
      if (run.status !== 'review' || typeof accepted !== 'boolean') throw new Error('The draft is not awaiting review');
      run.status = accepted ? 'accepted' : 'rejected';
      event(run, 'person', 'review', run.status, accepted ? 'Draft accepted in this example. Nothing is sent.' : 'Draft rejected. Preserve this run and revise the next definition.');
      return copy(run);
    }
    function trySend(id) {
      const run = runById(id);
      event(run, 'agent', 'send', 'refused', 'Sending is outside every grant in this example. The draft remains unsent.');
      return copy(run);
    }
    return { snapshot: () => copy(state), versions, selectWorkspace, saveCustomization, setGrant,
      updateComponent, startRun, step, runToStop, review, trySend };
  }
  return { createEngine, evaluateDraft, validateWorkflow, labels };
});
