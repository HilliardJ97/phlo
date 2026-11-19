# Phlo

A local-first working document for thinking out loud. Use Talk to shape notes, add evidence, and revise the same page. Build inline diagrams, metric visuals, and wireframes, then save a finished snapshot in Deliverables.

## Run locally

Double-click `Open Workspace.command` on macOS, or run:

```sh
python3 -B -m phlo_server.product_workspace --open-browser
```

Open http://127.0.0.1:8765/ and keep the server running. If the port is occupied, pass `--port 8766` and use that port. Desktop Chrome is recommended for Talk.

Text generation defaults to the local Codex CLI signed in with ChatGPT. Gemini is optional and is required for AI image generation. Provider requests can send selected context. Browser speech recognition may use an online service. Documents are stored in the ignored `work/` directory.

## Verify

```sh
python3 -B -m unittest discover -s tests
node --check product-workspace.js
```
