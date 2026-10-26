/* Scripted conversations over real browser-local state transitions; no model provider. */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./workflow-model.js') : root.WorkflowModel);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AssistantModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (workers) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const closed = new Set(['complete','clarification','accepted','rejected','needs_revision','budget_exhausted']);
  const labels = { base:'Base workflow', agent:'Agent instructions', tool:'Policy tool', execution:'Execution rule', customization:'Local context', personalization:'Personalization' };
  const grantsFor = { 'workspace.read':['read'], 'automation.define':['write'], 'automation.run':['read','execute'], 'agents.define':['write'], 'workflow.define':['write'], 'checks.run':['read','write','execute'], 'worker.run':['read','write','execute'], 'evidence.read':['read'] };
  const workerTools = ['policy.read','draft.prepare'];
  grantsFor['workflow.run']=['read','execute'];
  function routeRequest(text) {
    if (/\b(agent|assistant|engineer)\b/i.test(text)) return 'delegate';
    if (/\b(automate|daily|overdue|flag|every day)\b/i.test(text)) return 'automation';
    if (/\b(build|create)\b/i.test(text)) return 'delegate';
    if (/\b(blocked|holding|waiting|inspect|show|what)\b/i.test(text)) return 'direct';
    return 'clarification';
  }
  function validateWorker(definition, workspaceId) {
    return Boolean(definition && definition.workspaceId === workspaceId && Array.isArray(definition.allowedTools)
      && definition.allowedTools.length && definition.allowedTools.every(tool => workerTools.includes(tool))
      && Array.isArray(definition.conversationHistory) && definition.conversationHistory.length === 0);
  }
  function createEngine() {
    const makeWorkspace = (id,name,domain,focus,issue,records) => ({ id,name,domain,focus,issue,records,
      contextVersion:1, preferences:{version:1,tone:'concise'}, grants:{read:false,write:false,execute:false,revision:1},
      messages:[{role:'assistant',text:`I can use the ${name.toLowerCase()} workspace to inspect work, build a simple automation, or prepare specialist agents. What would help?`}] });
    const state = { activeWorkspace:'print', sequence:0, runs:[],
      components:{base:{version:1,requiresCitation:false},agent:{version:1,citePolicy:false},tool:{version:1,windowDays:7},execution:{version:1,maxActions:12}},
      workspaces:{
        print:makeWorkspace('print','Print shop','Print production','Check the approved proof before offering a reprint.','The delivered menus do not match the approved proof.',[
          {id:'P-104',name:'Menu reprint review',status:'waiting',ageDays:8,reason:'Waiting for a reprint decision'},
          {id:'P-108',name:'Poster proof',status:'waiting',ageDays:6,reason:'Waiting for a corrected file'},
          {id:'P-112',name:'Business cards',status:'ready',ageDays:1,reason:'Approved for production'}]),
        field:makeWorkspace('field','Field service','Equipment service','Check the service record before offering a return visit.','The repaired unit has stopped working again.',[
          {id:'S-204',name:'Return visit',status:'waiting',ageDays:9,reason:'Waiting for a technician assignment'},
          {id:'S-207',name:'Repair follow-up',status:'waiting',ageDays:6,reason:'Waiting for replacement parts'},
          {id:'S-211',name:'Routine service',status:'ready',ageDays:1,reason:'Visit confirmed'}])
      }
    };
    state.workspaces.print.case={id:'P-104',customer:'Harbor Street Bakery',quantity:500,ageDays:10,
      approved:{name:'Menu · approved v3',item:'Lunch special',price:'$12'},
      delivered:{name:'Menu · delivered v2',item:'Lunch special',price:'$10'}};
    state.workspaces.intake=makeWorkspace('intake','Shared intake','Internal requests','Check required details, prioritize stopped services and route each request to its owner.','Set up triage for a new shared intake.',[]);
    state.workspaces.intake.requirements={supportQueue:'Service desk',requireContact:true};
    state.workspaces.intake.samples=[
      {id:'IN-101',summary:'The team cannot sign in to our order system',contact:'Alex',category:'support',impact:'stopped'},
      {id:'IN-102',summary:'Please explain this invoice charge',contact:'Sam',category:'billing',impact:'normal'},
      {id:'IN-103',summary:'Can we add an export?',contact:'',category:'change',impact:'normal'}];
    function workspace(id=state.activeWorkspace) { if (!Object.hasOwn(state.workspaces,id)) throw new Error('Unknown workspace'); return state.workspaces[id]; }
    function findRun(id) { const run=state.runs.find(item=>item.id===id); if (!run) throw new Error('Unknown run'); return run; }
    function message(run,text) { workspace(run.workspaceId).messages.push({role:'assistant',text,runId:run.id}); }
    function record(run,actor,tool,result,detail) {
      run.trace.push({sequence:run.trace.length+1,position:run.position,actor,tool,result,detail,grantRevision:workspace(run.workspaceId).grants.revision});
    }
    function versions(id=state.activeWorkspace) {
      const w=workspace(id);
      return {...Object.fromEntries(Object.entries(state.components).map(([key,value])=>[key,value.version])),customization:w.contextVersion,personalization:w.preferences.version};
    }
    function setGrant(kind,on) {
      if (!['read','write','execute'].includes(kind) || typeof on!=='boolean') throw new Error('Unknown grant');
      const w=workspace(); if (w.grants[kind]!==on) {w.grants[kind]=on;w.grants.revision++;}
    }
    function updateComponent(kind) {
      if (kind==='customization') {const w=workspace();w.contextVersion++;w.focus='Record the source record and approval before proposing any remedy.';return versions();}
      if (kind==='personalization') {const w=workspace();w.preferences={version:w.preferences.version+1,tone:w.preferences.tone==='warm'?'concise':'warm'};return versions();}
      if (!Object.hasOwn(state.components,kind)) throw new Error('Unknown component');
      const next={...state.components[kind],version:state.components[kind].version+1};
      if (kind==='base') next.requiresCitation=true;
      if (kind==='agent') next.citePolicy=true;
      if (kind==='tool') next.windowDays=14;
      if (kind==='execution') next.maxActions=next.version%2===0?2:12;
      state.components[kind]=next;return versions();
    }
    function submit(text,options={}) {
      text=String(text).trim();
      if (!text || text.length>500) throw new Error('Use a request between 1 and 500 characters');
      if (state.runs.length>=20) throw new Error('Reset the example before starting more requests');
      const w=workspace();
      if (options.parentId && findRun(options.parentId).workspaceId!==w.id) throw new Error('Evidence belongs to another workspace');
      const path=routeRequest(text);
      const intake=w.id==='intake'&&path==='delegate';
      const plans={
        direct:[['Assistant','workspace.read','Inspect records'],['Assistant','answer','Answer directly']],
        automation:[['Assistant','workspace.read','Inspect records'],['Assistant','automation.define','Write a rule'],['Assistant','automation.run','Run the rule'],['Assistant','answer','Report the result']],
        delegate:[['Assistant','workspace.read','Inspect workspace'],['Assistant','agents.define','Prepare engineer'],['Engineering agent','workflow.define','Author workflow'],['Engineering agent','agents.define','Author worker'],['Engineering agent','checks.run','Check the result'],['Assistant','worker.run','Try the worker'],['Assistant','answer','Report back']],
        clarification:[]
      };
      if(intake)plans.delegate=[['Assistant','workspace.read','Read intake requirements'],['Assistant','agents.define','Brief engineer'],['Engineering agent','workflow.define','Author triage'],['Engineering agent','checks.run','Validate workflow'],['Assistant','workflow.run','Run sample intake'],['Assistant','answer','Report results']];
      const run={id:`Request ${++state.sequence}`,workspaceId:w.id,workspaceName:w.name,request:text,path,
        kind:intake?'intake':'case',parentId:options.parentId||null,status:path==='clarification'?'clarification':'ready',position:0,actions:0,
        versions:versions(),pins:clone({components:state.components,workspace:w}),plan:plans[path],artifacts:{},trace:[],result:null};
      state.runs.push(run);w.messages.push({role:'person',text:options.displayText||text,runId:run.id});
      const explanations={direct:'I can answer that with the workspace tools. No specialist agent is needed.',automation:'A saved filter is enough for this. I will define and run an ordinary rule; it needs no additional agent.',delegate:'I will inspect the workspace, prepare an engineering agent, and have it author a workflow and worker agent. Their definitions and checks will stay inspectable.',clarification:'This is a scripted example. Try asking what is blocked, asking for a daily review list, or asking me to build a specialist agent.'};
      message(run,explanations[path]);return clone(run);
    }
    function makeWorker(run) {
      const definition=run.artifacts.worker, flow=run.artifacts.workflow, engine=workers.createEngine({nodes:flow.nodes});
      engine.selectWorkspace(run.workspaceId);
      engine.saveCustomization({request:definition.context.request,focus:flow.localInstruction,channel:flow.channel,tone:definition.context.tone});
      for (const kind of ['base','agent','tool','execution']) {
        let version=run.versions[kind];
        if (kind==='agent') version=definition.citePolicy?Math.max(2,version):1;
        for (let i=1;i<version;i++) engine.updateComponent(kind);
      }
      engine.setGrant('read',workspace(run.workspaceId).grants.read&&definition.allowedTools.includes('policy.read'));
      engine.setGrant('draft',workspace(run.workspaceId).grants.write&&definition.allowedTools.includes('draft.prepare'));
      return engine.runToStop(engine.startRun().id);
    }
    function advance(id) {
      const run=findRun(id);
      if (closed.has(run.status)||run.status==='review') return clone(run);
      if (run.actions>=run.pins.components.execution.maxActions) {
        run.status='budget_exhausted';record(run,'Runtime','limit','stopped','The pinned action limit was reached. No further tool was executed.');
        message(run,'I reached the action limit for this request. Its partial work and trace are retained.');return clone(run);
      }
      const [actor,tool]=run.plan[run.position];run.actions++;
      const w=workspace(run.workspaceId), required=grantsFor[tool]||[];
      const missing=required.filter(kind=>!w.grants[kind]);
      if (missing.length) {
        run.status='blocked';record(run,'Runtime',tool,'refused',`Missing live ${missing.join(', ')} permission for ${w.name}. The tool did not run.`);
        const blockedOn=tool+':'+missing.join(',');
        if(run.blockedOn!==blockedOn)message(run,`I need permission to ${missing.map(kind=>({read:'read records and context',write:'create or revise draft definitions',execute:'run sample tools and checks'}[kind])).join(' and ')} in ${w.name} before I can continue. Grant it below, then continue.`);
        run.blockedOn=blockedOn;return clone(run);
      }
      if (actor==='Engineering agent'&&!run.artifacts.engineer.allowedTools.includes(tool)) {
        run.status='needs_revision';record(run,'Runtime',tool,'refused','The engineer definition does not allow this tool.');return clone(run);
      }
      run.status='running';run.blockedOn=null;
      if (tool==='workspace.read') {
        run.artifacts.records=clone(run.pins.workspace.records);
        record(run,actor,tool,'read',`Loaded ${run.artifacts.records.length} invented records and local context v${run.versions.customization}.`);
      }
      if (tool==='automation.define') {
        run.artifacts.automation={id:`Rule-${run.id.split(' ')[1]}`,type:'ordinary rule',createdBy:'Assistant',workspaceId:w.id,condition:{status:'waiting',minimumDays:5},steps:['Read records','Filter waiting items over five days','Return review list'],scheduled:false};
        record(run,actor,tool,'authored','Saved a deterministic filter. No model or worker agent is used to execute the rule.');
      }
      if (tool==='automation.run') {
        const rule=run.artifacts.automation.condition;
        run.result={type:'review-list',records:run.artifacts.records.filter(item=>item.status===rule.status&&item.ageDays>rule.minimumDays),additionalAgents:0};
        record(run,actor,tool,'executed',`The saved rule returned ${run.result.records.length} items. This is a sample run; no recurring schedule was created.`);
      }
      if (tool==='agents.define'&&actor==='Assistant') {
        run.artifacts.engineer={id:`Engineer-${run.id.split(' ')[1]}`,role:'Engineering agent',createdBy:'Assistant',workspaceId:w.id,
          instructions:`Author ${run.kind==='intake'?'an intake triage workflow':'a business worker and workflow'} for: ${run.request} Local requirement: ${run.pins.workspace.focus}`,
          allowedTools:['workspace.read','workflow.define','agents.define','checks.run'],conversationHistory:[],
          context:{domain:run.pins.workspace.domain,goal:run.request,localInstruction:run.pins.workspace.focus,...(run.kind==='intake'?{requirements:clone(run.pins.workspace.requirements)}:{})},grantSource:`Live grants for ${w.id}; no independent permission to send or publish`};
        record(run,actor,tool,'authored',`${run.artifacts.engineer.id} receives an explicit brief, scoped tools and zero inherited conversation messages.`);
      }
      if (tool==='workflow.define') {
        run.artifacts.workflow={...(run.kind==='intake'?workers.authorIntake(run.artifacts.engineer.context.requirements):{}),id:`Workflow-${run.id.split(' ')[1]}`,createdBy:run.artifacts.engineer.id,baseVersion:run.versions.base,workspaceId:w.id,
          localInstruction:run.pins.workspace.focus,channel:w.id==='print'?'Email':'Customer portal',
          ...(run.kind==='intake'?{}:{nodes:['intake','policy','draft',...(run.pins.components.base.requiresCitation?['check']:[]),'review']}),
          surface:run.kind==='intake'?{kind:'intake-triage',panels:['rules','results'],actions:['submit-intake']}:{kind:'case-review',panels:['source-files','reply'],actions:['approve-draft','send-back'],humanApproval:true}};
        record(run,actor,tool,'authored',`Created a workspace-specific workflow from base v${run.versions.base}.`);
      }
      if (tool==='agents.define'&&actor==='Engineering agent') {
        const sourceCase=run.pins.workspace.case;
        const request=sourceCase?`The approved menu shows the ${sourceCase.approved.item.toLowerCase()} at ${sourceCase.approved.price}; the delivered version shows ${sourceCase.delivered.price}.`:run.pins.workspace.issue;
        run.artifacts.worker={id:`Worker-${run.id.split(' ')[1]}`,role:'Business worker',createdBy:run.artifacts.engineer.id,workspaceId:w.id,
          workflowId:run.artifacts.workflow.id,instructions:'Use the case, local instruction and policy to prepare a draft for review.',
          citePolicy:run.pins.components.agent.citePolicy,allowedTools:clone(workerTools),conversationHistory:[],
          context:{domain:run.pins.workspace.domain,request,tone:run.pins.workspace.preferences.tone,...(sourceCase?{case:clone(sourceCase)}:{})},
          grantSource:`Live ${w.id} grants; preparation only, no sending`};
        record(run,actor,tool,'authored',`${run.artifacts.worker.id} is a new agent definition, linked to ${run.artifacts.workflow.id} and the engineer that authored it.`);
      }
      if (tool==='checks.run'&&run.kind==='intake') {
        run.artifacts.checks={passed:workers.validateIntake(run.artifacts.workflow)};
        record(run,actor,tool,run.artifacts.checks.passed?'passed':'failed','Validated the authored steps, ordered rules and human fallback before execution.');
        if(!run.artifacts.checks.passed){run.status='needs_revision';return clone(run);}
      }
      if (tool==='checks.run'&&run.kind!=='intake') {
        const contained=validateWorker(run.artifacts.worker,w.id), sample=contained?makeWorker(run):null;
        const passed=contained&&sample.status==='review';
        run.artifacts.checks={passed,scopeContained:contained,sampleStatus:sample?.status||'refused',sampleTrace:sample?.trace||[],sampleOutput:sample?.output||null};
        record(run,actor,tool,passed?'passed':'failed',passed?'The authored definition stays within its workspace/tools, and its sample execution reaches human review.':`The authored worker did not pass its actual sample run (${sample?.status||'invalid definition'}).`);
        if (!passed) {
          run.status='needs_revision';
          message(run,sample?.status==='needs_revision'?'The stricter base caught a missing policy citation in the worker’s output. I can use that evidence to revise the agent instructions and author a new version.':'The sample worker did not reach its required review state. Inspect the check and its trace before changing the definition.');
          return clone(run);
        }
      }
      if (tool==='worker.run') {
        const sample=makeWorker(run);
        run.artifacts.execution=sample;
        run.result={type:'worker-draft',output:sample.output,workerId:run.artifacts.worker.id,createdBy:run.artifacts.worker.createdBy,additionalAgents:2,sent:false};
        record(run,run.artifacts.worker.id,tool,sample.status,'The fresh business worker executed the authored workflow using the pinned tools and its explicit context.');
      }
      if(tool==='workflow.run') {
        const rows=workers.executeIntake(run.artifacts.workflow,run.pins.workspace.samples);
        run.executions=[{id:'Execution 1',rows}];
        run.result={type:'intake-results',rows,additionalAgents:1,externalActions:false};
        record(run,actor,tool,'executed',`Executed the saved triage definition on ${rows.length} sample submissions. No worker agent or external system was used.`);
      }
      if (tool==='answer') {
        if (run.path==='direct') run.result={type:'answer',records:run.artifacts.records.filter(item=>item.status==='waiting'),additionalAgents:0};
        const opening=run.pins.workspace.preferences.tone==='warm'?'Here is what I found. ':'';
        const answer=run.kind==='intake'?`The engineering agent authored the intake triage workflow. I ran its saved rules on ${run.result.rows.length} sample requests. Ready to try another submission; no live queue was changed.`:run.path==='direct'?`${opening}${run.result.records.length} items are waiting: ${run.result.records.map(item=>`${item.id} — ${item.reason.toLowerCase()}`).join('; ')}. I used the records directly and created no additional agent.`
          :run.path==='automation'?`${opening}The ordinary rule produced a ${run.result.records.length}-item review list. Its definition is saved in this example. It has no worker agent and no live recurring schedule.`
          :`${opening}The engineering agent authored the workflow and business worker. Checks passed and the worker prepared a draft. The definitions, lineage and execution trace are ready to inspect; nothing was sent.`;
        message(run,answer);record(run,actor,tool,'reported',answer);
      }
      run.position++;
      if (run.position===run.plan.length) run.status=run.path==='delegate'&&run.kind!=='intake'?'review':'complete';
      return clone(run);
    }
    function runToStop(id) { let run;do {run=advance(id);} while(run.status==='running'||run.status==='ready');return run; }
    function review(id,accepted) {
      const run=findRun(id);if(run.status!=='review'||typeof accepted!=='boolean')throw new Error('No result is awaiting review');
      run.status=accepted?'accepted':'rejected';record(run,'Person','review',run.status,'This accepts or rejects the example result. Nothing is deployed or sent.');return clone(run);
    }
    function editDraft(id,text) {
      const run=findRun(id);
      if(run.status!=='review'||typeof text!=='string'||!text.trim()||text.length>1000)throw new Error('Edit an awaiting draft using 1 to 1000 characters');
      run.result.output={...run.result.output,text:text.trim(),manuallyEdited:true};
      record(run,'Person','draft.edit','saved','The reviewer edited the draft. The original worker output is preserved. Nothing was sent.');
      return clone(run);
    }
    function reviseFromEvidence(id) {
      const source=findRun(id), w=workspace();
      if(source.workspaceId!==w.id||source.status!=='needs_revision'||source.artifacts.checks?.sampleStatus!=='needs_revision')throw new Error('No failed citation check to revise here');
      if(!w.grants.read||!w.grants.write)throw new Error('Live read and write grants are required to revise the definition');
      if(state.runs.length>=20)throw new Error('Reset before creating another request');
      updateComponent('agent');
      const next=submit(source.request,{parentId:source.id,displayText:'Use the failed check to revise the agent and try again.'});
      record(findRun(next.id),'Assistant','evidence.read','used',`Read the failed sample output in ${source.id}; revised agent instructions to require the policy source. The earlier artifacts are preserved.`);
      return clone(findRun(next.id));
    }
    function saveIntakeRequirements(requirements) {
      const w=workspace();if(w.id!=='intake')throw new Error('Choose the intake workspace');
      workers.authorIntake(requirements);
      if(JSON.stringify(w.requirements)!==JSON.stringify(requirements)){w.requirements=clone(requirements);w.contextVersion++;}
    }
    function runIntake(id,submissions) {
      const run=findRun(id),w=workspace(run.workspaceId);
      if(run.kind!=='intake'||run.status!=='complete')throw new Error('Author an intake workflow first');
      if(!w.grants.read||!w.grants.execute)throw new Error('Live read and execute grants are required');
      if(run.executions.length>=10)throw new Error('Build another workflow before running more submissions');
      const rows=workers.executeIntake(run.artifacts.workflow,submissions);
      const execution={id:`Execution ${run.executions.length+1}`,rows};run.executions.push(execution);
      record(run,'Assistant','workflow.run','executed',`${execution.id}: ${rows.length} submission(s), using ${run.artifacts.workflow.id}. Nothing was sent to a live queue.`);
      return clone(execution);
    }
    return {snapshot:()=>clone(state),versions,submit,advance,runToStop,setGrant,updateComponent,review,editDraft,reviseFromEvidence,saveIntakeRequirements,runIntake,
      selectWorkspace:id=>{workspace(id);state.activeWorkspace=id;}};
  }
  return {createEngine,routeRequest,validateWorker,labels};
});
