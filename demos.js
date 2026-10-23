// The three demos. All data is invented and lives in this file.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const redraw = () => window.canvasRedraw && window.canvasRedraw();

/* =====================================================================
   Demo 1 · Bounded agents
   ===================================================================== */
(function () {
  const W = 130, H = 46;
  const nodes = {
    intake:   { x: 15,  y: 20,  label: "Read the request", kind: "exact" },
    classify: { x: 205, y: 20,  label: "Decide what it is", kind: "model" },
    draft:    { x: 395, y: 20,  label: "Draft a reply", kind: "model" },
    gather:   { x: 205, y: 150, label: "Look things up", kind: "exact" },
    confirm:  { x: 395, y: 150, label: "Person confirms", kind: "person" },
    handoff:  { x: 15,  y: 150, label: "Person takes over", kind: "person" },
    act:      { x: 395, y: 280, label: "Do it", kind: "exact" },
    close:    { x: 205, y: 280, label: "Close the case", kind: "exact" },
  };
  const LIMIT = { gather: 3, revise: 2 };

  const cases = [
    {
      id: "c1",
      title: "Harbor Street Bakery: the proof doesn't match my order",
      message: "Hi, the menus we got look different from what we approved. Can you fix it?",
      classify: [
        { missing: "which order this is about", given: "the message, the customer's account" },
        { category: "Reprint request", confidence: 0.91, given: "the message, the order found, its approved proof" },
      ],
      gather: [
        "Found order 58213: 500 menus, proof v2 approved two days ago. Printed file was v1.",
      ],
      drafts: [
        "Hi Dana, you're right: we printed the earlier version of your menu, not the one you approved. We'll reprint order 58213 at no charge.",
        "Hi Dana, you're right: we printed the earlier version of your menu, not the one you approved. We'll reprint order 58213 at no charge, and it will ship on Thursday.",
      ],
      act: "Opened reprint job RJ-2207 for order 58213 and sent the reply.",
    },
    {
      id: "c2",
      title: "Pine Ridge School District: we were charged twice",
      message: "Our card was charged twice for invoice 4471. Please refund one.",
      classify: [
        { category: "Billing: duplicate charge", confidence: 0.95, given: "the message, invoice 4471, its two payments" },
      ],
      gather: [],
      drafts: [
        "Hello, thanks for flagging this. Invoice 4471 was paid twice on the 3rd. We've started a refund of $412.50 for the second payment.",
        "Hello, thanks for flagging this. Invoice 4471 was paid twice on the 3rd. We've started a refund of $412.50 for the second payment; it usually reaches your card in 3 to 5 business days.",
      ],
      act: "Opened refund RF-318 for $412.50, queued for finance, and sent the reply.",
    },
    {
      id: "c3",
      title: "Maple Lane Realty: can you help with the thing from last week?",
      message: "Following up on the thing from last week, any update?",
      classify: [
        { missing: "which order or job is meant", given: "the message, the customer's account" },
        { missing: "which order or job is meant", given: "the message, the last lookup" },
        { missing: "which order or job is meant", given: "the message, the last two lookups" },
      ],
      gather: [
        "No orders placed last week.",
        "Two open jobs found; neither was mentioned before.",
        "No earlier email thread from this sender.",
      ],
      drafts: [],
      act: "",
    },
  ];

  let C, S;
  function reset() {
    C = cases.find((c) => c.id === $("case-pick").value) || cases[0];
    S = { node: "intake", visited: new Set(), loops: { gather: 0, revise: 0 }, classifyN: 0, log: [], done: false, waiting: false };
    render();
  }
  function log(node, given, result, extra) {
    S.log.push({ node, kind: nodes[node].kind, given, result, extra });
  }

  function step() {
    if (S.done || S.waiting) return;
    S.visited.add(S.node);
    switch (S.node) {
      case "intake":
        log("intake", "the incoming email", "Opened a case and attached the message.");
        S.node = "classify"; break;
      case "classify": {
        const r = C.classify[Math.min(S.classifyN++, C.classify.length - 1)];
        if (r.missing) { log("classify", r.given, `Not enough to go on: missing ${r.missing}.`); S.node = "gather"; }
        else { log("classify", r.given, `${r.category} (confidence ${r.confidence}).`); S.node = "draft"; }
        break;
      }
      case "gather":
        if (S.loops.gather >= LIMIT.gather) {
          log("gather", "the loop counter", `Lookup limit of ${LIMIT.gather} reached. Stopping instead of guessing.`);
          S.node = "handoff"; break;
        }
        log("gather", "order history, open jobs, past email", C.gather[S.loops.gather]);
        S.loops.gather++;
        S.node = "classify"; break;
      case "draft":
        log("draft", "the request, what was found, the reply guidelines", "Wrote a draft for a person to check.", C.drafts[S.loops.revise]);
        S.node = "confirm"; S.waiting = true; break;
      case "act":
        log("act", "the approved draft", C.act);
        S.node = "close"; break;
      case "close":
        log("close", "the whole case", "Closed. Every step above stays on the case.");
        S.done = true; break;
      case "handoff":
        log("handoff", "everything tried so far", "Handed to a person with the three lookups attached, so nobody starts over.");
        S.done = true; break;
    }
    render();
  }

  function decide(ok) {
    if (!S.waiting) return;
    S.waiting = false;
    S.visited.add("confirm");
    if (ok) { log("confirm", "the draft", "Approved by a person."); S.node = "act"; }
    else if (S.loops.revise < LIMIT.revise) {
      S.loops.revise++;
      log("confirm", "the draft", "Sent back by a person: add when it will arrive.");
      S.node = "draft";
    } else {
      log("confirm", "the draft", `Sent back a third time. Revision limit of ${LIMIT.revise} reached.`);
      S.node = "handoff";
    }
    render();
  }

  function runToStop() {
    let guard = 30;
    while (!S.done && !S.waiting && guard--) step();
  }

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
    let s = `<svg viewBox="0 0 600 345" role="img" aria-label="Agent graph">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>`;
    s += edge("intake", "classify");
    s += edge("classify", "draft", { label: "clear" });
    s += edge("classify", "gather", { off: -22, label: "missing info", lx: 248, ly: 112, anchor: "end" });
    s += edge("gather", "classify", { off: 22, loop: true, label: `max ${LIMIT.gather} loops`, lx: 293, ly: 112, anchor: "start" });
    s += edge("gather", "handoff", { label: "limit reached" });
    s += edge("draft", "confirm", { off: -22 });
    s += edge("confirm", "draft", { off: 22, loop: true, label: `sent back, max ${LIMIT.revise}`, lx: 487, ly: 112, anchor: "start" });
    s += edge("confirm", "act", { label: "approved", lx: 470, ly: 240, anchor: "start" });
    s += edge("act", "close");
    for (const [id, n] of Object.entries(nodes)) {
      const cls = ["node", n.kind === "person" ? "person" : "", S.node === id && !S.done ? "current" : "", S.visited.has(id) ? "visited" : ""].join(" ");
      s += `<g class="${cls}"><rect x="${n.x}" y="${n.y}" width="${W}" height="${H}" rx="9"/>
        <text x="${n.x + 10}" y="${n.y + 19}">${n.label}</text>
        <text class="kind" x="${n.x + 10}" y="${n.y + 36}">${kindName[n.kind]}</text></g>`;
    }
    $("graph").innerHTML = s + "</svg>";
    const meter = (n, max) => `<span class="meter">${Array.from({ length: max }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
    $("loops").innerHTML = `<span>Lookups ${meter(S.loops.gather, LIMIT.gather)}</span><span>Revisions ${meter(S.loops.revise, LIMIT.revise)}</span>`;
  }

  function render() {
    renderGraph();
    $("case-body").innerHTML = `<div class="muted">Message</div><div>${esc(C.message)}</div>`;
    $("step").disabled = S.done || S.waiting;
    $("run").disabled = S.done || S.waiting;
    if (S.waiting) {
      const canRevise = S.loops.revise < LIMIT.revise;
      $("confirm").innerHTML = `<div class="stack"><div class="draft">${esc(C.drafts[S.loops.revise])}</div>
        <div class="row"><button class="btn person primary" id="ok">Approve</button>
        <button class="btn person" id="back">${canRevise ? "Send back" : "Send back (limit reached)"}</button></div></div>`;
      $("ok").onclick = () => decide(true);
      $("back").onclick = () => decide(false);
    } else if (S.done) {
      $("confirm").innerHTML = `<span class="badge ${S.node === "handoff" ? "wait" : "ok"}">${S.node === "handoff" ? "With a person" : "Closed"}</span>`;
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
  reset();
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
   Demo 3 · Grants and receipts
   ===================================================================== */
(function () {
  const STAGES = ["open", "contracted", "in progress", "tested", "in review", "merged"];
  let S;

  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, "0");
  }

  function reset() {
    S = {
      stage: "open", contract: null, edited: false, minute: 0,
      grants: [
        { id: "G-1", text: "The agent may change the files its contract names", on: false, by: "Given by the contract" },
        { id: "G-2", text: "The agent may open a pull request", on: false, by: "Given by a person" },
      ],
      receipts: [],
    };
    render();
  }
  const grant = (id) => S.grants.find((g) => g.id === id);

  function receipt(actor, op, ok, code, authority, change) {
    const prev = S.receipts.length ? S.receipts[S.receipts.length - 1].hash : "00000000";
    const time = `09:${String(S.minute++).padStart(2, "0")}`;
    const body = { n: S.receipts.length + 1, time, actor, op, ok, code, authority, change, prev };
    S.receipts.push({ ...body, hash: fnv(JSON.stringify(body)) });
  }
  function to(stage) { const from = S.stage; S.stage = stage; return `${from} → ${stage}`; }

  const ops = {
    writeContract() {
      if (S.contract) return;
      S.contract = { id: "K-7", steps: $("c-steps").value, paths: $("c-paths").value.split(",").map((s) => s.trim()).filter(Boolean), accept: $("c-accept").value, ceiling: "tested" };
      grant("G-1").on = true;
      receipt("person", "write contract K-7", true, "OK", "owner", to("contracted"));
    },
    agentEdit(path) {
      const g = grant("G-1");
      if (!g.on) return receipt("agent", `edit ${path}`, false, "NO_GRANT", "none", "nothing changed");
      if (!S.contract.paths.includes(path)) return receipt("agent", `edit ${path}`, false, "OUTSIDE_CONTRACT", "G-1", "nothing changed");
      S.edited = true;
      receipt("agent", `edit ${path}`, true, "OK", "G-1", S.stage === "contracted" ? to("in progress") : "file changed");
    },
    agentCheck() {
      if (!S.edited) return receipt("agent", "run the check", false, "NOTHING_TO_CHECK", "K-7", "nothing changed");
      receipt("agent", `run ${S.contract.accept}`, true, "OK", "K-7", S.stage === "in progress" ? to("tested") + " · 6 passed" : "6 passed");
    },
    agentPR() {
      if (!grant("G-2").on) return receipt("agent", "open pull request", false, "NO_GRANT", "none", "nothing changed");
      if (S.stage !== "tested") return receipt("agent", "open pull request", false, "NOT_TESTED", "G-2", "nothing changed");
      receipt("agent", "open pull request #42", true, "OK", "G-2", to("in review"));
    },
    agentClaimMerged() {
      receipt("agent", "report the task as merged", false, "ABOVE_CEILING", "K-7", `the contract caps its claims at "${S.contract ? S.contract.ceiling : "tested"}"`);
    },
    agentMerge() {
      receipt("agent", "merge #42", false, "NOT_INDEPENDENT", "none", "the author of a change cannot be the one who accepts it");
    },
    personMerge() {
      if (S.stage !== "in review") return receipt("person", "review and merge", false, "NOTHING_IN_REVIEW", "owner", "nothing changed");
      receipt("person", "review and merge #42", true, "OK", "owner", to("merged"));
    },
    toggle(id, on) {
      const g = grant(id);
      if (id === "G-1" && !S.contract && on) { receipt("person", "grant G-1", false, "NO_CONTRACT", "owner", "G-1 comes from a contract"); return; }
      g.on = on;
      receipt("person", `${on ? "grant" : "revoke"} ${id}`, true, "OK", "owner", `${id} ${on ? "on" : "off"}`);
    },
  };
  const act = (fn) => (...args) => { fn(...args); render(); };

  function render() {
    $("c-write").disabled = !!S.contract;
    ["c-steps", "c-paths", "c-accept"].forEach((id) => ($(id).disabled = !!S.contract));
    $("grants").innerHTML = S.grants.map((g) => `<label class="grant"><input type="checkbox" data-g="${g.id}" ${g.on ? "checked" : ""}>
      <div><div>${g.id} · ${esc(g.text)}</div><div class="who">${g.by}</div></div></label>`).join("");
    $("grants").querySelectorAll("input").forEach((i) => (i.onchange = () => act(ops.toggle)(i.dataset.g, i.checked)));

    const idx = STAGES.indexOf(S.stage);
    $("t-title").textContent = "Task T-14 · invoice export dates";
    $("t-state").innerHTML = STAGES.map((st, i) => `<span class="${i === idx ? "on" : i < idx ? "done" : ""}">${st}</span>`).join("");
    $("t-actions").innerHTML = `
      <h4>The agent tries to</h4>
      <div class="row">
        <button class="btn" data-a="edit1">edit src/export.py</button>
        <button class="btn" data-a="edit2">edit billing/rates.py</button>
        <button class="btn" data-a="check">run the check</button>
        <button class="btn" data-a="pr">open a pull request</button>
        <button class="btn" data-a="claim">report it as merged</button>
        <button class="btn" data-a="merge">merge it</button>
      </div>
      <h4>The person</h4>
      <div class="row">
        <button class="btn person" data-a="pmerge">reviews and merges</button>
        <button class="btn" data-a="reset">start over</button>
      </div>`;
    const map = {
      edit1: () => ops.agentEdit("src/export.py"), edit2: () => ops.agentEdit("billing/rates.py"),
      check: ops.agentCheck, pr: ops.agentPR, claim: ops.agentClaimMerged, merge: ops.agentMerge,
      pmerge: ops.personMerge,
    };
    $("t-actions").querySelectorAll("button").forEach((b) => (b.onclick = b.dataset.a === "reset" ? reset : act(map[b.dataset.a])));

    $("ledger").innerHTML = `<thead><tr><th>#</th><th>Time</th><th>Who</th><th>Tried to</th><th>Result</th><th>Authority</th><th>Change</th><th>Hash</th><th>Previous</th></tr></thead><tbody>` +
      (S.receipts.length
        ? S.receipts.slice().reverse().map((r) => `<tr><td>${r.n}</td><td class="mono">${r.time}</td>
            <td><span class="badge ${r.actor === "person" ? "person" : "model"}">${r.actor}</span></td>
            <td>${esc(r.op)}</td><td><span class="badge ${r.ok ? "ok" : "no"}">${r.ok ? "allowed" : r.code}</span></td>
            <td class="mono">${r.authority}</td><td>${esc(r.change)}</td><td class="mono">${r.hash}</td><td class="mono muted">${r.prev}</td></tr>`).join("")
        : `<tr><td colspan="9" class="empty">No receipts yet. Try an agent action before writing the contract.</td></tr>`) + "</tbody>";
    redraw();
  }

  $("c-write").onclick = act(ops.writeContract);
  reset();
})();
