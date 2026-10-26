// Existing portfolio demos. All business data is invented.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const redraw = () => window.canvasRedraw && window.canvasRedraw();

/* =====================================================================
   Demo 1 · Bounded agents
   ===================================================================== */
(function () {
  const W = 150, H = 50;
  const nodes = {
    intake:   { x: 15,  y: 20,  label: "Read the request", kind: "exact" },
    classify: { x: 245, y: 20,  label: "Decide what it is", kind: "model" },
    draft:    { x: 475, y: 20,  label: "Draft a reply", kind: "model" },
    gather:   { x: 245, y: 180, label: "Look things up", kind: "exact" },
    confirm:  { x: 475, y: 180, label: "Person confirms", kind: "person" },
    handoff:  { x: 15,  y: 180, label: "Person takes over", kind: "person" },
    act:      { x: 475, y: 340, label: "Do it", kind: "exact" },
    close:    { x: 245, y: 340, label: "Close the case", kind: "exact" },
  };
  const system=window.boundedSystem=BoundedModel.createSystem();
  const cases=BoundedModel.cases;
  let C,S,LIMIT,view;
  function act(fn){try{fn();$("r1-runtime-note").textContent='';}catch(error){$("r1-runtime-note").textContent=error.message;}render();}
  function reset(){act(()=>system.start($("case-pick").value||cases[0].id));}
  function ensureRun(){if(!system.snapshot().current)system.start($("case-pick").value||cases[0].id);}
  function step(){act(()=>{ensureRun();system.step();});}
  function runToStop(){act(()=>{ensureRun();system.runToStop();});}
  function decide(ok){act(()=>system.decide(ok));}

  function edge(a, b, opts = {}) {
    const A = nodes[a], B = nodes[b];
    let x1, y1, x2, y2;
    if (A.y === B.y) { // same row
      const right = B.x > A.x;
      x1 = right ? A.x + W : A.x; y1 = A.y + H / 2; x2 = right ? B.x : B.x + W; y2 = B.y + H / 2;
    } else if (A.x === B.x) { // same column
      const down = B.y > A.y, off = opts.off || 0;
      x1 = A.x + W / 2 + off; y1 = down ? A.y + H : A.y; x2 = B.x + W / 2 + off; y2 = down ? B.y : B.y + H;
    } else {
      x1 = A.x + W / 2; y1 = A.y + H; x2 = B.x + W; y2 = B.y + H / 2;
    }
    const d = opts.curve
      ? `M${x1},${y1} C${x1},${y1 + 70} ${x2 + 60},${y2 + 70} ${x2},${y2 + 10}`
      : `M${x1},${y1} L${x2},${y2}`;
    const lx = opts.lx ?? (x1 + x2) / 2, ly = opts.ly ?? (y1 + y2) / 2 - 5;
    return `<path class="edge ${opts.loop ? "loop" : ""}" d="${d}" marker-end="url(#arrow)"/>` +
      (opts.label ? `<text class="edge-label" x="${lx}" y="${ly}" text-anchor="${opts.anchor || "middle"}">${opts.label}</text>` : "");
  }

  function renderGraph() {
    const kindName = { model: "model", exact: "exact logic", person: "person" };
    let s = `<svg viewBox="0 0 720 410" role="img" aria-label="Agent graph">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>`;
    const path=view.current?.path||view.path;
    for(const link of path.edges){
      if(link.from==='classify'&&link.to==='handoff'){
        s+=`<path class="edge" d="M320,70 V110 H90 V180" marker-end="url(#arrow)"/><text class="edge-label" x="200" y="100" text-anchor="middle">missing info → person</text>`;
        continue;
      }
      if(link.from==='confirm'&&link.to==='handoff'){
        s+=`<path class="edge loop" d="M475,205 H442 V272 H190 V205 H165" marker-end="url(#arrow)"/><text class="edge-label" x="320" y="263" text-anchor="middle">revision limit → person</text>`;
        continue;
      }
      const key=link.from+'>'+link.to;
      const styles={
        'classify>draft':{label:'clear'},
        'classify>gather':{off:-22,label:'missing info',lx:286,ly:130,anchor:'end'},
        'gather>classify':{off:22,loop:true,label:`max ${LIMIT.gather} loops`,lx:354,ly:130,anchor:'start'},
        'gather>handoff':{label:'limit reached',ly:193},
        'draft>confirm':{off:-22},
        'confirm>draft':{off:22,loop:true,label:`sent back, max ${LIMIT.revise}`,lx:584,ly:130,anchor:'start'},
        'confirm>act':{label:'approved',lx:562,ly:290,anchor:'start'}
      };
      s+=edge(link.from,link.to,styles[key]||{});
    }
    for (const [id, n] of Object.entries(nodes)) {
      if(!path.nodes.includes(id))continue;
      const cls = ["node", n.kind === "person" ? "person" : "", S.node === id && !S.done ? "current" : "", S.visited.has(id) ? "visited" : ""].join(" ");
      s += `<g class="${cls}" data-node="${id}" role="button" tabindex="0" aria-label="Inspect ${n.label}"><rect x="${n.x}" y="${n.y}" width="${W}" height="${H}" rx="9"/>
        <text x="${n.x + 10}" y="${n.y + 19}">${n.label}</text>
        <text class="kind" x="${n.x + 10}" y="${n.y + 36}">${kindName[n.kind]}</text></g>`;
    }
    $("graph").innerHTML = s + "</svg>";
    const meter = (n, max) => `<span class="meter">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
    $("loops").innerHTML = `<span>Lookups ${meter(S.loops.gather, LIMIT.gather)}</span><span>Revisions ${meter(S.loops.revise, LIMIT.revise)}</span>`;
  }

  function render() {
    view=system.snapshot();
    const run=view.current;
    C=cases.find(item=>item.id===(run?.caseId||$("case-pick").value))||cases[0];
    S={node:run?.node||'intake',visited:new Set(run?.visited||[]),loops:run?.loops||{gather:0,revise:0},log:run?.log||[],done:!!run&&['complete','handoff','budget_exhausted'].includes(run.status),waiting:run?.status==='review'};
    LIMIT=(run?.path||view.path).limits;
    $("r1-path-source").textContent=view.path.version?`Agent-authored path v${view.path.version} · monitored in #3`:'Base example · author a monitored version in #3';
    if(run)$("case-pick").value=run.caseId;
    renderGraph();
    $("case-body").innerHTML = `<div class="muted">Message</div><div>${esc(C.message)}</div>`;
    $("step").disabled = S.done || S.waiting;
    $("run").disabled = S.done || S.waiting;
    if (S.waiting) {
      const canRevise = S.loops.revise < LIMIT.revise;
      $("confirm").innerHTML = `<div class="stack"><div class="draft">${esc(run?.draft||C.drafts[Math.min(S.loops.revise,C.drafts.length-1)]||'')}</div>
        <div class="row"><button class="btn person primary" id="ok">Approve</button>
        <button class="btn person" id="back">${canRevise ? "Send back" : "Send back (limit reached)"}</button></div></div>`;
      $("ok").onclick = () => decide(true);
      $("back").onclick = () => decide(false);
    } else if (S.done) {
      $("confirm").innerHTML = `<span class="badge ${run.status==='complete'?'ok':'wait'}">${run.status==='complete'?'Closed':'With a person'}</span>`;
    } else $("confirm").innerHTML = "";
    $("log").innerHTML = S.log.length
      ? S.log.slice().reverse().map((e) => `<li><div class="head"><b>${nodes[e.node].label}</b><span class="badge ${e.kind}">${e.kind === "exact" ? "exact logic" : e.kind}</span></div>
          <div class="kv">Given: <span>${esc(e.given)}</span></div>
          <div class="kv">Result: <span>${esc(e.result)}</span></div>
          ${e.extra ? `<div class="kv">Draft: <span>${esc(e.extra)}</span></div>` : ""}</li>`).join("")
      : `<li class="empty">Nothing has run yet. Every step will be written here.</li>`;
    redraw();
  }

  $("case-pick").innerHTML = cases.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join("");
  $("case-pick").onchange = reset;
  $("step").onclick = step;
  $("run").onclick = runToStop;
  $("reset").onclick = reset;
  $("graph").onclick=event=>{
    const node=event.target.closest('[data-node]');if(!node)return;
    const id=node.dataset.node;
    const tools={intake:'Read the incoming request.',classify:'Use the request and selected context to decide the next branch.',gather:`Look up context, at most ${LIMIT.gather} times.`,draft:'Prepare a reply; it cannot bypass the person.',confirm:`A person approves or sends back, at most ${LIMIT.revise} revisions.`,act:'Simulate the approved action in this example.',close:'Keep the outcome and run history.',handoff:'Stop and pass the case and attempted work to a person.'};
    $("r1-runtime-note").textContent=nodes[id].label+': '+tools[id];
  };
  $("graph").onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.target.closest('[data-node]')?.dispatchEvent(new MouseEvent('click',{bubbles:true}));}};
  system.subscribe(render);render();
})();

/* =====================================================================
   Demo 2 · One rule set, three surfaces
   ===================================================================== */

// The one rule. Every surface below calls this and only this.
function checkWire(doc, req) {
  const from = doc.parts[req.from], to = doc.parts[req.to];
  if (!from || !to) return { ok: false, code: "UNKNOWN_PART", reason: "Both ends must be parts of this diagram." };
  if (req.from === req.to) return { ok: false, code: "SAME_PART", reason: "A wire needs two different ends." };
  if (from.inside !== to.inside) {
    const port = doc.boundaryPort;
    if (!port) return { ok: false, code: "NO_PORT", reason: `Crossing "${doc.plane}" needs a port on its boundary.` };
    if (req.access === "write" && port.access !== "readwrite")
      return { ok: false, code: "PORT_READ_ONLY", reason: `The port on "${doc.plane}" allows reading only.` };
    return { ok: true, code: "OK", reason: `Allowed through the port on "${doc.plane}".` };
  }
  return { ok: true, code: "OK", reason: "Both ends are on the same side of every boundary." };
}

(function () {
  const doc = {
    plane: "Private network",
    boundaryPort: null,
    parts: {
      browser: { name: "Browser", inside: false, x: 10, y: 28 },
      api: { name: "API", inside: false, x: 10, y: 132 },
      db: { name: "Database", inside: true, x: 184, y: 28 },
      cache: { name: "Cache", inside: true, x: 184, y: 132 },
    },
  };
  const BW = 104, BH = 44, PORT = { x: 160, y: 110 };
  let last = null, picked = null;

  // --- the three surfaces: each only formats the same verdict for its caller ---
  const surfaces = {
    ui(req) { const v = checkWire(doc, req); last = { req, v }; drawSchem(); $("v-ui").innerHTML = `<span class="badge ${v.ok ? "ok" : "no"}">${v.ok ? "Wire added" : "Refused"}</span><span class="small">${esc(v.reason)}</span>`; return v; },
    http(req) {
      const v = checkWire(doc, req);
      $("v-api").textContent = `POST /api/documents/demo/wires\n${JSON.stringify(req, null, 2)}\n\n← ${v.ok ? "201 Created" : "409 Conflict"}\n${JSON.stringify(v, null, 2)}`;
      return v;
    },
    mcp(req) {
      const v = checkWire(doc, req);
      $("v-mcp").textContent = `→ tools/call "schematic.wire.add"\n${JSON.stringify({ arguments: req }, null, 2)}\n\n← ${JSON.stringify({ isError: !v.ok, structuredContent: v }, null, 2)}`;
      return v;
    },
  };

  function ask() {
    const req = { from: $("w-from").value, to: $("w-to").value, access: $("w-access").value };
    const answers = [surfaces.ui(req), surfaces.http(req), surfaces.mcp(req)];
    const same = answers.every((a) => a.code === answers[0].code);
    $("w-same").innerHTML = `<div class="same ${answers[0].ok ? "ok" : "no"}">${same ? `All three answered <b>${answers[0].code}</b>.` : "The surfaces disagree."} ${{ NO_PORT: "Try putting a port on the boundary.", PORT_READ_ONLY: "Try letting the port allow writes.", SAME_PART: "Pick two different parts." }[answers[0].code] || ""}</div>`;
    redraw();
  }

  function center(p) { return [p.x + BW / 2, p.y + BH / 2]; }
  function drawSchem() {
    let s = `<svg viewBox="0 0 300 200" role="img" aria-label="Diagram">
      <rect class="plane" x="${PORT.x}" y="8" width="136" height="186" rx="10"/>
      <text class="plane-label" x="${PORT.x + 10}" y="23">${doc.plane}</text>`;
    if (last) {
      const a = doc.parts[last.req.from], b = doc.parts[last.req.to];
      if (a && b && a !== b) {
        const [x1, y1] = center(a), [x2, y2] = center(b);
        const via = a.inside !== b.inside && doc.boundaryPort;
        const d = via ? `M${x1},${y1} L${PORT.x},${PORT.y} L${x2},${y2}` : `M${x1},${y1} L${x2},${y2}`;
        s += `<path class="wire ${last.v.ok ? "ok" : "no"}" d="${d}"/>`;
      }
    }
    for (const [id, p] of Object.entries(doc.parts)) {
      s += `<g class="comp ${picked === id ? "sel" : ""}" data-part="${id}"><rect x="${p.x}" y="${p.y}" width="${BW}" height="${BH}" rx="7"/>
        <text x="${p.x + BW / 2}" y="${p.y + BH / 2 + 4}" text-anchor="middle">${p.name}</text></g>`;
    }
    s += `<circle class="port ${doc.boundaryPort ? "" : "hidden"}" cx="${PORT.x}" cy="${PORT.y}" r="6"/>`;
    $("schem").innerHTML = s + "</svg>";
    $("schem").querySelectorAll(".comp").forEach((g) => (g.onclick = () => {
      const id = g.dataset.part;
      if (!picked) { picked = id; drawSchem(); return; }
      $("w-from").value = picked; $("w-to").value = id; picked = null; ask();
    }));
  }

  const opts = Object.entries(doc.parts).map(([id, p]) => `<option value="${id}">${p.name}</option>`).join("");
  $("w-from").innerHTML = opts; $("w-to").innerHTML = opts;
  $("w-from").value = "browser"; $("w-to").value = "db";
  const syncPort = () => {
    $("w-port-access").disabled = !$("w-port").checked;
    doc.boundaryPort = $("w-port").checked ? { access: $("w-port-access").value } : null;
  };
  $("w-port").onchange = () => { syncPort(); ask(); };
  $("w-port-access").onchange = () => { syncPort(); ask(); };
  $("w-ask").onclick = ask;
  $("rule-src").textContent = checkWire.toString();
  drawSchem();
  ask();
})();

/* =====================================================================
   Demo 4 · One design system, many looks
   ===================================================================== */
(function () {
  const data = window.BD_LOOKS;
  if (!data) return;
  const link = $("look-css");
  let current = "night-glass";
  try { const saved = localStorage.getItem("look"); if (saved && data.looks[saved]) current = saved; } catch (e) {}

  function pick(id) {
    current = id;
    link.href = `looks/${id}.css`;
    try { localStorage.setItem("look", id); } catch (e) {}
    render();
    link.onload = () => redraw();
  }

  function render() {
    const L = data.looks[current];
    $("look-grid").innerHTML = data.order.map((id) => {
      const l = data.looks[id];
      return `<button class="look-btn" data-look="${id}" aria-pressed="${id === current}"><b>${esc(l.label)}</b>
        <span class="small muted">${esc(l.brand)} accent</span>
        <span class="sw"><i style="background:${l.character.Accent}"></i></span></button>`;
    }).join("");
    $("look-grid").querySelectorAll("button").forEach((b) => (b.onclick = () => pick(b.dataset.look)));
    $("look-mood").textContent = L.mood;
    $("look-char").innerHTML = Object.entries(L.character).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(String(v).split(",")[0].replace(/"/g, ""))}</td></tr>`).join("");
    $("look-score").textContent = `${L.passed} of ${L.total} measures pass across light and dark. The first five, in dark:`;
    $("look-measures").innerHTML = L.measures.map((m) => `<div class="measure"><span class="badge ${m.ok ? "ok" : "no"}">${m.ok ? "pass" : "fail"}</span>
      <span>${esc(m.says)} <span class="muted mono">${m.value} (${m.kind} ${m.bound})</span></span></div>`).join("");
    const req = { look: current, document: { catalog: "bdos-design@0.1.0", title: "Approve a reply", root: { type: "page", "...": "" } } };
    $("look-api").textContent = `POST /v1/compile\n${JSON.stringify(req, null, 2)}\n\n← 200\n${JSON.stringify({ ok: true, look: current, brand: L.brand, css: `:root { --bd-color-accent: ${L.character.Accent}; --bd-radius-card: ${L.character["Card rounding"]}; … }`, html: "<!doctype html>…" }, null, 2)}`;
    redraw();
  }

  link.href = `looks/${current}.css`;
  render();
})();
