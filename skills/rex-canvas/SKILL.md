---
name: rex-canvas
description: Show the diagram you are drawing with the Markasso MCP live in a Rex pane beside your own. Use when the user asks for a diagram, schema, whiteboard or "tela"/canvas with Markasso while you run inside Rex ($REX_BLOCK is set), or asks to see the diagram next to the chat.
---

# rex-canvas

`rex-canvas` shows a PNG in a Rex pane next to yours and redraws it whenever
the file changes. Pair it with the Markasso MCP so the user watches the
diagram take shape while you work.

Only use it when `$REX_BLOCK` is set (you are running in a Rex pane).

## Flow

1. Get the canvas paths once (this also creates the folder):
   ```bash
   rex-canvas path          # the PNG the pane shows
   rex-canvas path --svg    # its vector sibling, saved along with it
   ```
2. Open the viewer pane once. It does nothing if the pane is already open,
   and it does not take focus:
   ```bash
   rex-canvas show
   ```
3. Build the diagram (`diagram_new`, `diagram_add_nodes`, `diagram_connect`),
   then `diagram_layout` with `direction: "TB"` (see Readability).
4. Fix what the tools report: if `diagram_layout` or `diagram_export_png`
   lists warnings (arrows through nodes, overlapping labels, crossings),
   resolve them before moving on (see Readability).
5. Export after each batch of changes:
   - `diagram_export_png` with `path` = the PNG path and
     `returnImage: false` (Markasso MCP 0.6.0+), so the refresh costs no
     context. Leave `returnImage` on only when you want to look at the
     result yourself. On an older MCP that rejects `returnImage`, drop it.
   - `diagram_export_svg` with `path` = the SVG path.
   The pane updates on its own within a fraction of a second.
6. When the user is done, offer `diagram_share` (link) or `diagram_save`
   (`.markasso` file) to keep editing it, and `rex-canvas hide` to close the
   pane.

## Readability

The pane is a side split: tall and narrow. A wide diagram is shrunk to fit
and its text becomes hard to read.

- Prefer `direction: "TB"`. Use `"LR"` only for short chains (3 nodes or
  fewer) or when the user asks.
- Keep labels short: a few words per node, short edge labels. Put detail in
  a separate text node rather than a long label.
- Arrow through a node or tangled crossings: try the other direction, give
  the edge `routing: "elbow"`, or reorder/split the diagram into groups.
- More than about 12 nodes: split into several diagrams or group them, rather
  than one huge board.

## Rules

- Export per batch of edits (after `diagram_layout`), not after every single
  node. Look at the result yourself (`returnImage` on) at least once before
  calling the diagram done.
- Always export to the paths from `rex-canvas path`: those are the files the
  pane and its save key use. Don't invent other paths.
- The user can pan (hjkl, arrows), zoom (+/-), refit (`0`), save a copy to
  ~/Downloads (`s`, PNG plus the SVG) and open it in the default app (`o`).
  You don't need to export crops, zoomed versions or downloads yourself.
