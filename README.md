# portfolio

Brandon Freeman's portfolio, live at https://bdo.recd.stream.

One pan-and-zoom canvas with four small demos, each running in the browser on invented data:

1. **Bounded agents**: an agent works a support request through a graph whose steps are run by a
   model, by exact logic or by a person, with a limit on every loop and every step written to the case.
2. **One rule set**: one function decides whether a wire may cross a boundary, and the editor, an
   HTTP API and an MCP tool call all ask it, so a person and an agent get the same answer.
   Based on [Schematically](https://github.com/bdf1992/schematically).
3. **Author and monitor #1**: the request and scoped tools let a bounded authoring agent create
   the actual graph used in demo1. Both surfaces share one model. Child steps, human-review stops,
   outcomes and limits feed its monitor. A lookup-limit handoff can produce a retained revision that
   sends missing context to a person earlier. Parent versions, tools and child runs are bounded too.
   Authoring and model replies are scripted; graph execution and monitoring are local state transitions.
4. **One design system**: the page is dressed by bdos-design. Pick one of its seven looks and the whole
   canvas changes, with the measures each look passes and the compile call an agent would make.
   `looks/*.css` and `looks/looks.js` are compiled from bdos-design (`bdos-design compile`, `bdos-design looks --json`).

Plain HTML, CSS and JavaScript; no build step, no backend. To run it locally:

```
python -m http.server 8000
```

The site opens in reading view for legibility; the canvas remains available. Link directly to the
workflow at https://bdo.recd.stream/#r3. Prior usage estimates have been removed from the work example.

`bounded-model.js` owns path definitions, execution, parent tool budgets and monitoring.
`demos.js` binds demo1; `workflow-view.js` binds demo3 to the same workspace instance.
Earlier reprint and intake models were retired when this shared model replaced them.
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
