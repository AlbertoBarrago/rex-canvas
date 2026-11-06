# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`rex-canvas`: a CLI that shows a live PNG in a Rex pane with the kitty graphics protocol. Built so an agent drawing with the Markasso MCP (`diagram_export_png` with `path`) can show the diagram beside the chat. It knows nothing about Markasso: it watches a file.

## Commands

```sh
npm run dev -- view --file x.png   # run from source (tsx src/cli.ts)
npm run build                      # tsc to dist/ + chmod +x dist/cli.js
npm run typecheck
npm test                           # tsx --test test/*.test.ts (node:test)
npx tsx --test test/viewport.test.ts
rex config check rex/rex-canvas.lua
```

To check the real viewer without touching the current layout, open it in its own Rex window and read the status line:
`rex --autostart=false window new -s "$REX_SESSION" CanvasTest --focus=false --json -- node "$PWD/dist/cli.js" view --file x.png`, then `rex capture -s "$REX_SESSION" -b <block_id> --trim`, and `rex send ... '+'` / `'q'` to drive keys. `capture` sees text only: the image itself needs a human look. Test `show`/`hide` with `--block <a test window's block>` so they don't split the pane you run in.

## Architecture

- `src/cli.ts`: commands. `show` starts the viewer via `process.execPath` + the resolved script path, so the new pane doesn't depend on its PATH.
- `src/viewer.ts`: the only stateful/I/O-heavy module. Probe (graphics query, `CSI 16 t`, `CSI 14 t`, then DA1 as the sentinel) → poll loop → key handling. New image: transmit under a new id, place, then delete the old id. Pan/zoom: re-place with the same placement id. Resize: clear + re-upload.
- Pure, tested modules: `png.ts` (signature, IHDR, walk to IEND: a missing IEND means the writer isn't done), `kitty.ts` (escape builders, all with `q=2`), `viewport.ts` (view = zoom relative to fit + normalized center), `input.ts` (splits stdin into keys and terminal replies, keeps partial sequences in `rest`).
- `src/rex.ts`: `rex` CLI only, always `--autostart=false`. `rex split --json` returns `{anchor_id, block_ids: [new], ...}`: never take `anchor_id` as the new pane.
- `src/state.ts`: per-pane canvas path and `panes.json` (canvas path → viewer block), written atomically.
- `skills/rex-canvas/SKILL.md`: the agent skill, shipped in the package and installed by `rex-canvas skill install`.

## Toolchain quirks

- ESM only (`"type": "module"`, `NodeNext`): relative imports in `src/` use the `.js` extension.
- TypeScript 7: `"types": ["node"]` in `tsconfig.json`.
- No runtime dependencies; keep it that way unless there is a strong reason.

## VCS

Plain `git` (no jj): one branch per task off `main`, never commit directly on `main`.
