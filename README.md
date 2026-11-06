# rex-canvas

Watch the diagram your agent is drawing, live, in a [Rex](https://www.superlogical.com/rex) pane beside the chat.

Ask Claude Code for a Markasso diagram and a pane opens next to its own. Every time the agent exports the board, the pane redraws it. One screen, chat on one side, the diagram on the other. Pan and zoom in the pane without asking the agent to re-render anything.

`rex-canvas` is a generic PNG viewer: it watches one file and shows it with the [kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/). Markasso is the use case it was built for, but anything that writes a PNG works. Inspired by [almonk/rexpad](https://github.com/almonk/rexpad).

## Install

Requires **Node.js 22+** and Rex (the viewer works in any terminal with kitty graphics; `show`/`hide` need Rex).

```sh
git clone https://github.com/AlbertoBarrago/rex-canvas.git
cd rex-canvas
npm install          # also builds dist/ through the prepare script
npm link             # or: ln -s "$PWD/dist/cli.js" ~/.local/bin/rex-canvas
rex-canvas skill install
```

For the Markasso flow, use `@markasso/mcp` 0.6.0 or later: its `diagram_export_png` can write the file without sending the image back to the agent, and its layout warnings keep the diagram readable in a narrow pane.

`skill install` writes `~/.claude/skills/rex-canvas/SKILL.md`, which tells Claude Code to open the pane and export to it when it draws with the Markasso MCP. Use `--dir` for other agents, or `rex-canvas skill show` to paste it elsewhere.

### Rex action (optional)

```sh
cp rex/rex-canvas.lua ~/.config/rex/
echo 'require("rex-canvas")' >> ~/.config/rex/init.lua
rex config check && rex config reload
```

`ctrl+b m` (or `rex do rex_canvas`, or "Open Canvas" in the palette) opens the canvas of the focused pane.

## Try it

In a Rex pane:

```sh
rex-canvas show                       # opens the viewer on the right, focus stays here
cp some-image.png "$(rex-canvas path)"
```

## Usage

```sh
rex-canvas show [--ratio 40] [--below]   # open the viewer beside this pane; no-op if already open
rex-canvas hide                          # close it
rex-canvas path [--svg]                  # this pane's canvas PNG, or its SVG sibling (creates the folder)
rex-canvas view [--file P]               # run the viewer in the current terminal
rex-canvas skill install [--dir DIR] | skill show
```

Every command takes `--file P` to use another PNG (env `REX_CANVAS_FILE`) and `--block ID` to act for another pane.

### Keys in the viewer

| Keys | |
| --- | --- |
| `h` `j` `k` `l`, arrows | pan |
| Page Up / Page Down | pan by a page |
| `+` / `-` | zoom in / out |
| `0` | fit, and follow new images again |
| `f` | toggle follow (refit on every new image) |
| `s` | save a copy to `~/Downloads` (the PNG on screen, plus the `.svg` and `.markasso` next to it if present) |
| `o` | open the canvas in the default app |
| `q` | quit |

Saved copies are named `canvas-YYYYMMDD-HHMMSS.png` and never overwrite an existing file. Set `REX_CANVAS_DOWNLOADS` to save elsewhere.

Panning or zooming turns follow off, so a new export doesn't throw away the area you were looking at.

## How it works

- **One canvas per agent pane**: `~/.local/state/rex-canvas/<block>.png` (respects `XDG_STATE_HOME`), so two agents don't overwrite each other.
- **The viewer** polls the file's mtime and size every 200 ms. It only accepts a PNG whose chunks run all the way to `IEND`, so a file caught mid-write is retried on the next tick instead of shown broken.
- **Upload once, crop for free**: a new image is uploaded under a fresh id, placed, and only then is the old one deleted (no flicker). Pan and zoom re-issue the placement with a new crop: a few bytes per key press, no re-upload.
- **Sizing**: the viewer asks the terminal for its cell size in pixels (`CSI 16 t`, then `CSI 14 t`) and fits the image keeping its aspect ratio, never upscaling a small one.
- **The pane**: `show` runs `rex split` beside `$REX_BLOCK` without focus and remembers the pane in `panes.json`; the viewer registers itself too, so panes opened from the Rex action are known to `show` and `hide`.
- Talks to Rex only through the `rex` CLI, always with `--autostart=false`. No runtime dependencies.

## Development

```sh
npm run dev -- view --file some.png
npm run typecheck
npm test
npm run build
```

## License

[MIT](LICENSE)
