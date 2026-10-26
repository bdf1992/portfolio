# portfolio

Brandon Freeman's portfolio, live at https://bdo.recd.stream.

One pan-and-zoom canvas with four small demos, each running in the browser on invented data:

1. **Example workflow**: a bounded support agent uses model decisions, exact logic and human review.
2. **Example workflow generation**: a bounded authoring agent builds the actual flow in example1,
   then monitors it. Both levels have intake; inner monitoring follows execution while outer monitoring
   checks the original goal, outcomes and same-case comparisons. Earlier runs stay pinned.
3. **Data, security, traces and signals**: one model and permission function serves the editor,
   HTTP and MCP. Each check records its input, boundary permission and all three results. The last four
   checks stay inspectable; allowed/refused counts are derived from actual calls in this local example.
   Based on [Schematically](https://github.com/bdf1992/schematically).
4. **Generative UI**: the design system and compiler contract used by people and agents to create
   consistent interfaces. Picking a look changes this page. Compiler excerpts are real; no live UI
   generation service is connected. Tokens come from private bdos-design.

Plain HTML, CSS and JavaScript; no build step, no backend. To run it locally:

```
python -m http.server 8000
```

The site opens in reading view for legibility; the canvas remains available. Link directly to the
workflow at https://bdo.recd.stream/#r2. Prior usage estimates have been removed from the work example.

`bounded-model.js` owns path definitions, execution, parent tool budgets and monitoring.
`demos.js` binds demo1; `workflow-view.js` binds demo2 to the same workspace instance.
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
