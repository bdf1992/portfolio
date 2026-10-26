# portfolio

Brandon Freeman's portfolio, live at https://bdo.recd.stream.

One pan-and-zoom canvas with four small demos, each running in the browser on invented data:

1. **Bounded agents**: an agent works a support request through a graph whose steps are run by a
   model, by exact logic or by a person, with a limit on every loop and every step written to the case.
2. **One rule set**: one function decides whether a wire may cross a boundary, and the editor, an
   HTTP API and an MCP tool call all ask it, so a person and an agent get the same answer.
   Based on [Schematically](https://github.com/bdf1992/schematically).
3. **Assistant workspace**: the conversation is an interface to shared tools. A request can be
   answered directly from records, become an ordinary deterministic automation, or lead the assistant
   to prepare an engineering agent. That engineer authors a workflow and a fresh business worker;
   their actual definitions are checked and executed. The new agents receive explicit briefs without
   inherited chat history and use tools within live workspace grants. Inspect lineage, definitions,
   checks and execution; use a failed check to author a revised version. Each request pins its base,
   instructions, tools, execution rule, local context and personalization. The print example starts
   with a read grant; writing and execution require separate grants. Conversations are scripted,
   with no real provider, company data, external actions or recurring schedules.
4. **One design system**: the page is dressed by bdos-design. Pick one of its seven looks and the whole
   canvas changes, with the measures each look passes and the compile call an agent would make.
   `looks/*.css` and `looks/looks.js` are compiled from bdos-design (`bdos-design compile`, `bdos-design looks --json`).

Plain HTML, CSS and JavaScript; no build step, no backend. To run it locally:

```
python -m http.server 8000
```

The site opens in reading view for legibility; the canvas remains available. Link directly to the
workflow at https://bdo.recd.stream/#r3. Prior usage estimates have been removed from the work example.

The models are separate from their DOM view. `assistant-model.js` coordinates tools and authors
definitions; `workflow-model.js` executes the authored worker graph and settings. Both expose the same
state transitions to Node and the browser. `workflow-view.js` binds the conversation and inspectors.
Run the bounded routine check with:

```
node scripts/check-workflow.cjs
```

`verification-policy.json` fixes the case/time budget and complete model coverage scope. The runner
retains source/test hashes, Node identity, count, coverage and elapsed time under ignored `verification/`.
Browser behavior and layout are checked separately; no UI line-coverage percentage is claimed.

Hosted on Cloudflare Pages. Deploy only the public HTML, CSS, JS and `looks/` assets from a staging
directory with `wrangler pages deploy <staging-directory> --project-name portfolio --branch main`.
Keep tests, verification artifacts, Git metadata and private files out of the upload.
