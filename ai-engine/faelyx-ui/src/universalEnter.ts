// Universal "Enter confirms" rule, installed once for the whole app.
//
// Pressing Enter in a value field (number, text, select, checkbox) confirms
// it, wherever it is:
//   1. A field that handles Enter itself (the sketch bottom bar, the tool
//      card, an inline editor) is left alone — those stop or cancel the
//      event before it gets here.
//   2. Otherwise, if the field sits in a definition box with its own
//      confirm button (3D Design's Apply changes / Update / Create /
//      Run, a dialog's OK), Enter presses that button.
//   3. Otherwise the field is committed by leaving it (blur), which is what
//      every on-blur field in the app already does to accept a value.
// Multi-line boxes (the AI composer, notes) and search boxes are skipped.

const PRIMARY = '[data-enter-default], .sketch-dialog-ok';
// Enter never reaches past one of these: a field is confirmed by its own
// panel only, never by a button somewhere else in the app.
const BOUNDARY = '.inspector-panel, .toolbox-panel, .model-panel, .reset-confirm-box, .sketch-dialog, [role="dialog"], form';
const SKIP = 'textarea, [contenteditable="true"], .tree-search, .search-command, .ai-composer, [data-no-enter]';

const usable = (el: Element): el is HTMLButtonElement => {
  const b = el as HTMLButtonElement;
  return b.offsetParent !== null && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
};

/** The confirm button of the panel the field is in, if it has one and it is ready. `null` = no such button, `false` = there is one but it is disabled. */
function confirmButton(field: HTMLElement): HTMLButtonElement | null | false {
  let found = false;
  for (let el: HTMLElement | null = field.parentElement; el; el = el.parentElement) {
    const candidates = [...el.querySelectorAll(PRIMARY)].filter((c) => (c as HTMLElement).offsetParent !== null);
    if (candidates.length) {
      const ready = candidates.find(usable);
      if (ready) return ready as HTMLButtonElement;
      found = true;
    }
    if (el.matches(BOUNDARY)) break;
  }
  return found ? false : null;
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;
  const isField = t instanceof HTMLSelectElement
    || (t instanceof HTMLInputElement && !['button', 'submit', 'reset', 'file', 'range', 'color', 'image', 'search', 'radio'].includes(t.type));
  if (!isField || t.closest(SKIP)) return;
  const btn = confirmButton(t);
  if (btn) { e.preventDefault(); btn.click(); return; }
  if (btn === false) { e.preventDefault(); return; }
  if (t instanceof HTMLInputElement && t.type !== 'checkbox') { e.preventDefault(); t.blur(); }
}

/** Installs the rule; returns the function that removes it. */
export function installUniversalEnter(): () => void {
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}
