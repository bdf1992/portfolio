/* Scripted authoring and replies; shared, bounded graph execution is real local state. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;else root.BoundedModel=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  const nodeCatalog={intake:{label:'Read the request',kind:'exact'},classify:{label:'Decide what it is',kind:'model'},
    gather:{label:'Look things up',kind:'exact'},draft:{label:'Draft a reply',kind:'model'},confirm:{label:'Person confirms',kind:'person'},
    act:{label:'Do it',kind:'exact'},close:{label:'Close the case',kind:'exact'},handoff:{label:'Person takes over',kind:'person'}};
  const request='Create the support flow in #1: read each request, look up missing context, draft a reply and require a person’s approval before acting. Bound the lookup and revision loops, record each step and monitor the runs.';
  const cases=[
    {id:'c1',title:"Harbor Street Bakery: the proof doesn't match my order",message:'Hi, the menus we got look different from what we approved. Can you fix it?',
      classify:[{missing:'which order this is about',given:"the message, the customer's account"},{category:'Reprint request',confidence:0.91,given:'the message, the order found, its approved proof'}],
      gather:['Found order 58213: 500 menus, proof v2 approved two days ago. Printed file was v1.'],
      drafts:["Hi Dana, you're right: we printed the earlier version of your menu, not the one you approved. We'll reprint order 58213 at no charge.","Hi Dana, you're right: we printed the earlier version of your menu, not the one you approved. We'll reprint order 58213 at no charge, and it will ship on Thursday."],
      act:'Simulated: prepared reprint job RJ-2207 for order 58213 and the approved reply.'},
    {id:'c2',title:'Pine Ridge School District: we were charged twice',message:'Our card was charged twice for invoice 4471. Please refund one.',
      classify:[{category:'Billing: duplicate charge',confidence:0.95,given:'the message, invoice 4471, its two payments'}],gather:[],
      drafts:["Hello, thanks for flagging this. Invoice 4471 was paid twice on the 3rd. We've started a refund of $412.50 for the second payment.","Hello, thanks for flagging this. Invoice 4471 was paid twice on the 3rd. We've started a refund of $412.50 for the second payment; it usually reaches your card in 3 to 5 business days."],
      act:'Simulated: prepared refund RF-318 for $412.50 and the approved reply; nothing sent.'},
    {id:'c3',title:'Maple Lane Realty: can you help with the thing from last week?',message:'Following up on the thing from last week, any update?',
      classify:[{missing:'which order or job is meant',given:"the message, the customer's account"},{missing:'which order or job is meant',given:'the message, the last lookup'},{missing:'which order or job is meant',given:'the message, the last two lookups'}],
      gather:['No orders placed last week.','Two open jobs found; neither was mentioned before.','No earlier email thread from this sender.'],drafts:[],act:''}
  ];
  const terminal=new Set(['complete','handoff','budget_exhausted']);
  function config(value){
    if(!value||!Number.isInteger(value.lookupLimit)||value.lookupLimit<1||value.lookupLimit>3||!Number.isInteger(value.revisionLimit)||value.revisionLimit<0||value.revisionLimit>2
      ||(value.stepLimit!==undefined&&(!Number.isInteger(value.stepLimit)||value.stepLimit<1||value.stepLimit>24)))throw new Error('Use 1–3 lookups, 0–2 revisions and at most 24 steps');
    return {gather:value.lookupLimit,revise:value.revisionLimit,steps:value.stepLimit??24};
  }
  function edges(missing){return [
    ['intake','next','classify'],['classify','clear','draft'],['classify','missing',missing==='handoff'?'handoff':'gather'],
    ['gather','found','classify'],['gather','limit','handoff'],['draft','next','confirm'],
    ['confirm','approved','act'],['confirm','revise','draft'],['confirm','limit','handoff'],['act','next','close']
  ].filter(([from])=>missing!=='handoff'||from!=='gather').map(([from,on,to])=>({from,on,to}));}
  function validatePath(path){
    if(!path||!Array.isArray(path.nodes)||path.nodes.length!==Object.keys(nodeCatalog).length-(path.missing==='handoff'?1:0)||new Set(path.nodes).size!==path.nodes.length||!path.nodes.every(id=>Object.hasOwn(nodeCatalog,id)&&(path.missing!=='handoff'||id!=='gather'))
      ||!['lookup','handoff'].includes(path.missing)||!Array.isArray(path.edges))return false;
    try{config({lookupLimit:path.limits.gather,revisionLimit:path.limits.revise,stepLimit:path.limits.steps});}catch{return false;}
    const expected=edges(path.missing);
    return path.edges.length===expected.length&&expected.every(edge=>path.edges.filter(item=>item&&item.from===edge.from&&item.on===edge.on&&item.to===edge.to).length===1);
  }
  function pathDefinition(version,limits,missing='lookup',basedOn=null){return {id:version?`Path-${version}`:'Base path',version,createdBy:version?'Bounded authoring agent':'Example base',
    request,nodes:Object.keys(nodeCatalog).filter(id=>missing!=='handoff'||id!=='gather'),edges:edges(missing),limits:copy(limits),missing,basedOn};}
  function createSystem(){
    let state;
    const listeners=new Set();
    function initial(){const path=pathDefinition(0,{gather:3,revise:2,steps:24});return {path,current:null,runs:[],paths:[path],builder:{status:'ready',toolsUsed:0,maxTools:14,versionsUsed:0,maxVersions:2,runsUsed:0,maxRuns:3,trace:[],observation:'Author a bounded path, then monitor its runs in #1.',canRevise:false,evidence:null}};}
    state=initial();
    function snapshot(){return copy(state);}
    function emit(){for(const listener of listeners)listener(snapshot());}
    function trace(tool,result,detail,extra={}){const b=state.builder;b.trace.push({sequence:b.trace.length+1,tool,result,detail,...extra});}
    function refuse(reason){const b=state.builder;b.status='handoff';b.observation=reason;b.canRevise=false;
      if(!b.trace.some(item=>item.result==='refused'&&item.detail===reason))trace('Runtime','refused',reason);
      emit();throw new Error(reason);
    }
    function reserve(count){if(state.builder.toolsUsed+count>state.builder.maxTools)refuse('The authoring agent reached its 14-tool limit. A person must review or reset this example.');}
    function tool(name,detail,extra={}){state.builder.toolsUsed++;trace(name,'used',detail,extra);}
    function build(limits,missing,basedOn){
      const b=state.builder;
      if(b.status==='handoff')throw new Error(b.observation);
      if(state.current?.pathVersion&&['ready','running'].includes(state.current.status))throw new Error('Finish the active child run before authoring another path');
      if(b.versionsUsed>=b.maxVersions)refuse('The authoring agent reached its two-version limit. A person must review or reset this example.');
      reserve(4);b.status='authoring';
      tool('catalog.read','Read the permitted node types, tools and runtime limits.');
      const path=pathDefinition(b.versionsUsed+1,limits,missing,basedOn);
      tool('paths.write',`Authored ${path.id} from the request and permitted primitives.`,{pathId:path.id});
      if(!validatePath(path))refuse('The authored path failed its graph check. A person must review it.');
      tool('paths.check','Checked transitions, human approval, loop limits and handoff.',{pathId:path.id});
      state.path=path;state.paths.push(path);state.current=null;b.versionsUsed++;b.canRevise=false;
      tool('paths.install',`Installed ${path.id} as the graph used in #1. Earlier runs retain their own path.`,{pathId:path.id});
      b.status='monitoring';b.observation=basedOn?`Used ${basedOn.runId} to author an earlier human handoff. Start a new run to compare it.`:`${path.id} is installed in #1. Start a case to observe its actual execution.`;
      emit();return copy(path);
    }
    function author(value){return build(config(value),'lookup',null);}
    function current(){if(!state.current)throw new Error('Start a case first');return state.current;}
    function event(run,node,given,result,extra,eventType){
      run.log.push({node,kind:nodeCatalog[node].kind,given,result,...(extra?{extra}:{}),...(eventType?{event:eventType}:{})});
    }
    function observe(run){
      if(run.pathVersion===0)return;
      const b=state.builder,stop=run.status==='review'||terminal.has(run.status),halted=b.status==='handoff',haltReason=b.observation;
      if(stop&&!run.observed){tool('runs.observe',`Observed ${run.id} at ${run.status}; later events from this run update the same subscription.`,{runId:run.id,pathId:run.pathId});run.observed=true;}
      const limit=run.log.find(item=>item.event==='lookup_limit');
      b.evidence={runId:run.id,pathId:run.pathId,status:run.status,node:run.node,steps:run.steps,lookups:run.loops.gather,limit:limit?'gather':null};
      b.observation=limit?`${run.id}: ${run.loops.gather} lookups found no clear request. ${run.status==='handoff'?'The runtime stopped and handed it to a person.':'The lookup limit was reached; handoff is the next step.'}`
        :run.status==='review'?`${run.id}: draft ready; waiting for a person’s approval. The authoring agent cannot approve it.`
        :run.status==='complete'?`${run.id}: completed after a person approved. ${run.steps} steps recorded; no external action occurred.`
        :run.status==='handoff'?`${run.id}: handed to a person. ${run.loops.gather} lookups and ${run.loops.revise} revisions recorded.`
        :run.status==='budget_exhausted'?`${run.id}: the child reached its ${run.path.limits.steps}-step bound and stopped for a person.`
        :`${run.id}: observing ${nodeCatalog[run.node].label.toLowerCase()} (${run.steps} steps recorded).`;
      b.status='monitoring';b.canRevise=Boolean(limit&&run.status==='handoff'&&run.pathId===state.path.id&&state.path.missing==='lookup'&&b.versionsUsed<b.maxVersions&&b.toolsUsed+4<=b.maxTools);
      if(halted){b.status='handoff';b.observation=haltReason;b.canRevise=false;}
    }
    function start(caseId){
      const sample=cases.find(item=>item.id===caseId);if(!sample)throw new Error('Unknown case');
      if(state.current?.pathVersion&&['ready','running'].includes(state.current.status))throw new Error('Finish the active child run before starting another');
      if(state.runs.length>=20)refuse('This example retains at most 20 runs. Reset before starting another.');
      if(state.path.version){
        const b=state.builder;if(b.status==='handoff')throw new Error(b.observation);if(b.runsUsed>=b.maxRuns)refuse('The authoring agent reached its three-run limit. A person must review or reset this example.');
        reserve(2);tool('runs.start','Started a child execution with its saved path and scoped case.',{pathId:state.path.id});b.runsUsed++;
      }
      const run={id:`Run-${state.runs.length+1}`,caseId,pathId:state.path.id,pathVersion:state.path.version,path:copy(state.path),node:'intake',visited:[],loops:{gather:0,revise:0},log:[],status:'ready',steps:0,classifyN:0,draft:'',observed:false,externalActions:false};
      state.runs.push(run);state.current=run;observe(run);emit();return copy(run);
    }
    function move(run,on){run.node=run.path.edges.find(edge=>edge.from===run.node&&edge.on===on).to;}
    function enter(run){
      if(run.steps>=run.path.limits.steps){run.status='budget_exhausted';event(run,run.node,'the runtime step counter',`Step limit of ${run.path.limits.steps} reached. A person takes over.`,null,'step_limit');return false;}
      run.steps++;if(!run.visited.includes(run.node))run.visited.push(run.node);return true;
    }
    function step(){
      const run=current();if(run.status==='review'||terminal.has(run.status))return copy(run);
      if(!enter(run)){observe(run);emit();return copy(run);}
      const sample=cases.find(item=>item.id===run.caseId);run.status='running';
      switch(run.node){
        case 'intake':event(run,'intake','the incoming email','Opened a case and attached the message.');move(run,'next');break;
        case 'classify':{
          const result=sample.classify[Math.min(run.classifyN++,sample.classify.length-1)];
          event(run,'classify',result.given,result.missing?`Not enough to go on: missing ${result.missing}.`:`${result.category} (confidence ${result.confidence}).`);
          move(run,result.missing?'missing':'clear');break;
        }
        case 'gather':
          if(run.loops.gather>=run.path.limits.gather){event(run,'gather','the loop counter',`Lookup limit of ${run.path.limits.gather} reached. Stopping instead of guessing.`,null,'lookup_limit');move(run,'limit');}
          else{event(run,'gather','order history, open jobs, past email',sample.gather[Math.min(run.loops.gather,sample.gather.length-1)]||'No matching record found.');run.loops.gather++;move(run,'found');}break;
        case 'draft':run.draft=sample.drafts[Math.min(run.loops.revise,sample.drafts.length-1)]||'A person must supply the missing context.';
          event(run,'draft','the request, what was found, the reply guidelines','Wrote a draft for a person to check.',run.draft);move(run,'next');run.status='review';break;
        case 'act':event(run,'act','the approved draft',sample.act);move(run,'next');break;
        case 'close':event(run,'close','the whole case','Closed. Every step stays on the case; no external system was changed.');run.status='complete';break;
        case 'handoff':event(run,'handoff','everything tried so far',`Handed to a person with ${run.loops.gather} lookups and ${run.loops.revise} revisions attached.`);run.status='handoff';break;
      }
      observe(run);emit();return copy(run);
    }
    function runToStop(){let run=current();while(run.status==='ready'||run.status==='running'){step();run=current();}return copy(run);}
    function decide(accepted){
      const run=current();if(run.status!=='review'||typeof accepted!=='boolean')throw new Error('Only a person can approve or return an awaiting draft');
      if(!enter(run)){observe(run);emit();return copy(run);}
      if(accepted){event(run,'confirm','the draft','Approved by a person.');move(run,'approved');}
      else if(run.loops.revise<run.path.limits.revise){run.loops.revise++;event(run,'confirm','the draft','Sent back by a person: add when it will arrive.');move(run,'revise');}
      else{event(run,'confirm','the draft',`Revision limit of ${run.path.limits.revise} reached. A person takes over.`,null,'revision_limit');move(run,'limit');}
      run.status='running';observe(run);emit();return copy(run);
    }
    function revise(){
      const b=state.builder;if(!b.canRevise)throw new Error('No monitored lookup-limit run is available for a revision within the authoring bounds');
      return build(state.path.limits,'handoff',{runId:b.evidence.runId,pathId:state.path.id,reason:'Lookup limit reached without identifying the request'});
    }
    return {snapshot,author,start,step,runToStop,decide,revise,
      reset:()=>{state=initial();emit();return snapshot();},
      subscribe:listener=>{if(typeof listener!=='function')throw new Error('A listener function is required');listeners.add(listener);return ()=>listeners.delete(listener);}};
  }
  return {createSystem,cases:copy(cases),nodeCatalog:copy(nodeCatalog),request,validatePath};
});
