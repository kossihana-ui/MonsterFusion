/**
 * Room for the keyboard.
 *
 * A phone's keyboard takes the bottom half of the screen, and the browser is
 * supposed to scroll the focused field clear of it. Inside itch.io's mobile
 * player the game runs in a fullscreen element, and there that goes wrong:
 * the field is reported as off somewhere it is not, and a Japanese keyboard -
 * which is taller than a Latin one, with its own candidate strip - comes up
 * clipped. A player trying to type a name reaches な and は and finds the
 * rows below them cut off the bottom of the screen.
 *
 * This cannot be fixed from inside the frame. What it can do is put the field
 * where the browser's own scrolling would have put it, which is the middle of
 * whatever is left of the screen, and do it again when the keyboard finishes
 * opening - `visualViewport` reports that, and it is the only honest signal
 * for how much screen is left.
 *
 * Deliberately narrow: pointer-coarse screens, text fields only, and it
 * scrolls - it never moves or repositions anything. On a desktop it does
 * nothing at all.
 */
const TEXTUAL = /^(text|search|email|tel|url|password|number|)$/;

function isTextField(node: EventTarget | null): node is HTMLInputElement | HTMLTextAreaElement {
  if (!(node instanceof HTMLElement)) return false;
  if (node instanceof HTMLTextAreaElement) return true;
  return node instanceof HTMLInputElement && TEXTUAL.test(node.type);
}

/** Centre the field in the space the keyboard leaves, if that is not already so. */
function keepInView(field: HTMLElement): void {
  const room = window.visualViewport?.height ?? window.innerHeight;
  const box = field.getBoundingClientRect();
  // A margin, so the field is not flush against the keyboard's top edge.
  if (box.top >= 8 && box.bottom <= room - 8) return;
  field.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function giveTheKeyboardRoom(): () => void {
  if (typeof window === "undefined") return () => {};
  if (!window.matchMedia?.("(pointer: coarse)").matches) return () => {};

  let field: HTMLElement | null = null;

  const onFocus = (event: FocusEvent) => {
    if (!isTextField(event.target)) return;
    field = event.target;
    // The keyboard is not up yet on focus; the viewport change below is what
    // actually tells us, and this first pass is for the case where no
    // keyboard appears at all.
    keepInView(field);
  };
  const onBlur = () => { field = null; };
  // Fired when the keyboard finishes opening or closing, which is the moment
  // the amount of screen left is finally known.
  const onResize = () => { if (field) keepInView(field); };

  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onBlur);
  window.visualViewport?.addEventListener("resize", onResize);
  return () => {
    document.removeEventListener("focusin", onFocus);
    document.removeEventListener("focusout", onBlur);
    window.visualViewport?.removeEventListener("resize", onResize);
  };
}
