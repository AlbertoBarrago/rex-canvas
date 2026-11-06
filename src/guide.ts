/**
 * What the viewer shows while it has no image yet: an empty pane gives no
 * clue that it is waiting for a file, or how to fill it. Pure, so it can be
 * tested; the viewer only positions the lines.
 */

/** Keys line, shared with the help text so the two never drift apart. */
export const GUIDE_KEYS = 'hjkl pan  +/- zoom  0 fit  s save  o open  q quit';

/** Shortens `text` to `width` columns, keeping the end (the file name) visible. */
export function fitStart(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  return width === 1 ? '…' : `…${text.slice(text.length - (width - 1))}`;
}

/** Shortens `text` to `width` columns, keeping the start. */
export function fitEnd(text: string, width: number): string {
  if (width <= 0) return '';
  if (text.length <= width) return text;
  return width === 1 ? '…' : `${text.slice(0, width - 1)}…`;
}

/** `/Users/me/x` -> `~/x` when `home` is set. */
export function tildify(path: string, home: string | undefined): string {
  return home && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path;
}

/**
 * Lines of the empty-state guide for a pane `width` columns wide. `notice`
 * (such as "not a valid PNG") replaces the opening line. Narrow panes get a
 * shorter guide rather than lines cut mid-sentence.
 */
export function waitingGuide(opts: { file: string; width: number; home?: string; notice?: string }): string[] {
  const { width } = opts;
  const path = tildify(opts.file, opts.home);
  const head = opts.notice ?? 'Nothing to show yet. Watching:';
  if (width < 40) {
    return [fitEnd(head, width), fitStart(path, width), '', fitEnd('Export a PNG there.', width), fitEnd('q quits', width)];
  }
  // Lines that end in the path keep their prefix and shorten only the path,
  // so the `cp` command stays readable in a narrow pane.
  const withPath = (prefix: string) => `${prefix}${fitStart(path, width - prefix.length)}`;
  return [
    fitEnd(head, width),
    withPath('  '),
    '',
    'To fill it:',
    '  ask Claude in the pane beside for a Markasso diagram',
    '  (the rex-canvas skill exports it here), or copy any PNG:',
    withPath('  cp image.png '),
    '',
    'The pane redraws on every change of the file.',
    `Keys: ${GUIDE_KEYS}`,
  ].map((line) => fitEnd(line, width));
}
