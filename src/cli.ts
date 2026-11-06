#!/usr/bin/env node
import { mkdir, realpath } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { blockExists, closeBlock, splitBeside } from './rex.js';
import { siblingPath } from './save.js';
import { installSkill, readSkill } from './skill.js';
import { canvasPath, readPanes, setPane } from './state.js';
import { runViewer } from './viewer.js';

const HELP = `rex-canvas: show a live PNG in a Rex pane (kitty graphics protocol)

Usage:
  rex-canvas show [--file P] [--ratio PCT] [--below]   open the viewer beside this pane (no focus change; no-op if open)
  rex-canvas hide [--file P]                           close the viewer pane
  rex-canvas view [--file P]                           run the viewer in this terminal (q quits)
  rex-canvas path [--file P] [--svg]                   print the canvas PNG (or its SVG sibling) path for this pane
  rex-canvas skill install [--dir DIR]                 install the agent skill (default ~/.claude/skills)
  rex-canvas skill show                                print the agent skill

Options:
  --file P      canvas PNG (env REX_CANVAS_FILE; default: one per pane, under ~/.local/state/rex-canvas)
  --block ID    pane the canvas belongs to (default $REX_BLOCK)
  --ratio PCT   share of the split for the viewer (default 40)
  --below       open below instead of on the right
`;

/** How to start this same CLI in a new pane, independent of the pane's PATH. */
async function selfCommand(): Promise<string[]> {
  const script = process.argv[1];
  if (!script) throw new Error('cannot locate the rex-canvas script');
  return [process.execPath, ...process.execArgv, await realpath(script)];
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      file: { type: 'string' },
      block: { type: 'string' },
      ratio: { type: 'string', default: '40' },
      below: { type: 'boolean', default: false },
      svg: { type: 'boolean', default: false },
      dir: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });
  const [command, sub] = positionals;
  const target = { file: values.file, block: values.block };

  if (values.help || !command || command === 'help') {
    process.stdout.write(HELP);
    return command || values.help ? 0 : 1;
  }

  switch (command) {
    case 'path': {
      const png = canvasPath(target);
      // The vector copy lives next to the PNG, where `s` in the viewer finds it.
      const file = values.svg ? siblingPath(png, '.svg') : png;
      // Producers like the Markasso MCP don't create parent folders.
      await mkdir(dirname(file), { recursive: true });
      process.stdout.write(`${file}\n`);
      return 0;
    }

    case 'show': {
      const anchor = values.block || process.env.REX_BLOCK;
      if (!anchor) throw new Error('not inside a Rex pane ($REX_BLOCK is unset); pass --block');
      const ratio = Number(values.ratio);
      if (!Number.isInteger(ratio) || ratio < 10 || ratio > 90) throw new Error('--ratio must be an integer between 10 and 90');
      const file = canvasPath({ file: values.file, block: anchor });
      const existing = (await readPanes())[file];
      if (existing && (await blockExists(existing))) {
        process.stdout.write(`already open in ${existing}\n`);
        return 0;
      }
      await mkdir(dirname(file), { recursive: true });
      const block = await splitBeside({
        anchor,
        ratio,
        below: values.below,
        label: 'canvas',
        command: [...(await selfCommand()), 'view', '--file', file],
      });
      if (block) await setPane(file, block);
      process.stdout.write(`opened ${block ?? 'viewer'} for ${file}\n`);
      return 0;
    }

    case 'hide': {
      const file = canvasPath(target);
      const block = (await readPanes())[file];
      if (!block) {
        process.stdout.write('no viewer open\n');
        return 0;
      }
      if (await blockExists(block)) await closeBlock(block);
      await setPane(file, undefined);
      process.stdout.write(`closed ${block}\n`);
      return 0;
    }

    case 'view': {
      const file = canvasPath(target);
      // The viewer registers its own pane, so panes opened by the Lua action
      // (not by `show`) are known to `show` and `hide` too.
      const self = process.env.REX_BLOCK;
      if (self) await setPane(file, self);
      try {
        await runViewer({ file });
      } finally {
        if (self && (await readPanes())[file] === self) await setPane(file, undefined);
      }
      return 0;
    }

    case 'skill': {
      if (sub === 'show') {
        process.stdout.write(await readSkill());
        return 0;
      }
      if (sub === 'install') {
        process.stdout.write(`installed ${await installSkill(values.dir)}\n`);
        return 0;
      }
      throw new Error('usage: rex-canvas skill install [--dir DIR] | skill show');
    }

    default:
      throw new Error(`unknown command '${command}' (see rex-canvas help)`);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    process.stderr.write(`rex-canvas: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
