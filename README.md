# portfolio

Brandon Freeman's portfolio, live at https://bdo.recd.stream.

One pan-and-zoom canvas with three small demos, each running in the browser on invented data:

1. **Bounded agents**: an agent works a support request through a graph whose steps are run by a
   model, by exact logic or by a person, with a limit on every loop and every step written to the case.
2. **One rule set**: one function decides whether a wire may cross a boundary, and the editor, an
   HTTP API and an MCP tool call all ask it, so a person and an agent get the same answer.
   Based on [Schematically](https://github.com/bdf1992/schematically).
3. **Grants and receipts**: a person writes an agent a contract, actions are allowed only under a live
   grant, and every attempt leaves a hash-chained receipt. Based on
   [Soveraeign](https://github.com/bdf1992/Soveraeign).

Plain HTML, CSS and JavaScript; no build step, no backend. To run it locally:

```
python -m http.server 8000
```

Hosted on Cloudflare Pages (`wrangler pages deploy . --project-name portfolio`).
