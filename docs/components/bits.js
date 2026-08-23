// Byte colouring, shared by the bit inputs and the bit results: no separator
// characters, consecutive bytes alternate colour instead.

import { html } from "../lib/html.js";

export const COLORS = ["orange", "red", "yellow", "green", "blue", "purple", "muted"];

export const colorVar = (name) => `var(--c-${COLORS.includes(name) ? name : "muted"})`;

const ZERO_WIDTH_SPACE = "\u200B";

// byteSpans cuts the text into one span per byte, from the right so the low
// byte is always a whole one. With breakable set, a zero width space goes
// between the bytes: a long value then wraps on byte boundaries only, never
// inside one. The overlay of an input must not do that, or the copy would stop
// lining up with the text underneath.
//
// Whether a letter counts depends on what the box holds. A decoder pattern like
// 0000vvvv is still a word and reads better with its bytes told apart, so
// letters are welcome there. A number box is not so lucky: 0xCD is all letters
// and digits too, and colouring it byte by byte would claim it was bits.
export function byteSpans(text, breakable = false, letters = true) {
  // Anything else is not a bit string (yet), so show it plain and let the error
  // line do the talking.
  if ((letters ? /[^01a-zA-Z]/ : /[^01]/).test(text)) return text;

  const out = [];
  for (let end = text.length, i = 0; end > 0; end -= 8, i++) {
    if (breakable && i > 0) out.unshift(ZERO_WIDTH_SPACE);
    out.unshift(html`<span key=${i} class=${i % 2 ? "byte-odd" : "byte-even"}>${
      text.slice(Math.max(end - 8, 0), end)
    }</span>`);
  }
  return out;
}
