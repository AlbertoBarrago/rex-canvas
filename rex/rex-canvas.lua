-- rex-canvas: open the canvas viewer beside the focused pane.
--
-- Install:
--   cp "$(npm root -g)/rex-canvas/rex/rex-canvas.lua" ~/.config/rex/
--   echo 'require("rex-canvas")' >> ~/.config/rex/init.lua
--   rex config check && rex config reload
--
-- Then press ctrl+b m, run `rex do rex_canvas`, or pick "Open Canvas" from
-- the command palette. The viewer shows the canvas of the pane that was
-- focused, the same file `rex-canvas path` prints there.

-- Program to run. Use an absolute path if Rex still can't find it.
local REX_CANVAS_BIN = "rex-canvas"

-- Rex starts commands through a non-interactive login shell, which skips
-- ~/.zshrc / ~/.bashrc. Common user bin dirs are prepended so a binary
-- installed with `npm link` or symlinked into ~/.local/bin is still found.
local home = os.getenv("HOME") or ""
local EXTRA_PATH = {
  home .. "/.local/bin",
  home .. "/.npm-global/bin",
  home .. "/.n/bin",
  "/opt/homebrew/bin",
  "/usr/local/bin",
}

rex.action{
  name        = "rex_canvas",
  title       = "Open Canvas",
  description = "Show this pane's canvas (a live PNG, such as a Markasso diagram) in a split beside it.",
  keywords    = "canvas diagram markasso image png preview",
  run         = function(ctx, args)
    local _, err = rex.session.new_split{
      anchor_id = ctx.block_id,
      direction = "horizontal",
      side      = "after",
      -- Share kept by the existing pane; the canvas gets the rest.
      ratio     = 0.6,
      focus     = false,
      layout    = rex.layout.block{
        flavor  = "com.superlogical.terminal.shell",
        label   = "canvas",
        options = {
          command      = { REX_CANVAS_BIN, "view", "--block", ctx.block_id },
          path_prepend = EXTRA_PATH,
        },
      },
    }
    if err ~= nil then error(err, 0) end
  end,
}

-- Change or remove this line to pick your own key.
rex.bind("ctrl+b>m", "rex_canvas")
