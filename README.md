# portfolio

Brandon Freeman's portfolio, live at https://bdo.recd.stream.

One pan-and-zoom canvas with four small demos, each running in the browser on invented data:

1. **Bounded agents**: an agent works a support request through a graph whose steps are run by a
   model, by exact logic or by a person, with a limit on every loop and every step written to the case.
2. **One rule set**: one function decides whether a wire may cross a boundary, and the editor, an
   HTTP API and an MCP tool call all ask it, so a person and an agent get the same answer.
   Based on [Schematically](https://github.com/bdf1992/schematically).
3. **Workflow workspace**: a person customizes a reusable base workflow for a print shop or field
   service business. A fresh, simulated agent receives the saved definition and no conversation history.
   Each run pins its base, agent instructions, tool, execution rule, customization and personalization.
   Live workspace grants are checked at action time. Update components, inspect a policy-citation
   failure, revise the agent and compare the next run. No real provider or company data is used.
4. **One design system**: the page is dressed by bdos-design. Pick one of its seven looks and the whole
   canvas changes, with the measures each look passes and the compile call an agent would make.
   `looks/*.css` and `looks/looks.js` are compiled from bdos-design (`bdos-design compile`, `bdos-design looks --json`).

Plain HTML, CSS and JavaScript; no build step, no backend. To run it locally:

```
python -m http.server 8000
```

The site opens in reading view for legibility; the canvas remains available. Link directly to the
workflow at https://bdo.recd.stream/#r3. Prior usage estimates have been removed from the work example.

The workflow model is separate from its DOM view. `workflow-model.js` exposes the same state transitions
to Node and the browser; `workflow-view.js` binds the controls. Run the bounded routine check with:

```
node scripts/check-workflow.cjs
```

`verification-policy.json` fixes the case/time budget and complete model coverage scope. The runner
retains source/test hashes, Node identity, count, coverage and elapsed time under ignored `verification/`.
Browser behavior and layout are checked separately; no UI line-coverage percentage is claimed.

Hosted on Cloudflare Pages. Deploy only the public HTML, CSS, JS and `looks/` assets from a staging
directory with `wrangler pages deploy <staging-directory> --project-name portfolio --branch main`.
Keep tests, verification artifacts, Git metadata and private files out of the upload.
