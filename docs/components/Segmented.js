// The segmented word, wrapped so the rest of the page can stay declarative.

import { html } from "../lib/html.js";
import { useRef, useLayoutEffect } from "preact/hooks";
import { mountSegments } from "./segments-dom.js";

export function Segmented({ tool, onValues }) {
  const host = useRef(null);
  // The callback changes identity on every render; the widget must not be torn
  // down and rebuilt for that, so it reads the latest one through a ref.
  const latest = useRef(onValues);
  latest.current = onValues;

  useLayoutEffect(() => mountSegments(host.current, tool, (v) => latest.current(v)), [tool]);
  return html`<div ref=${host}></div>`;
}
