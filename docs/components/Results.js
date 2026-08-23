// One labelled line per result, and the two notes underneath: what went wrong,
// and the reminder that a value can be copied.

import { html } from "../lib/html.js";
import { useState } from "preact/hooks";
import { byteSpans } from "./bits.js";

export function Results({ fields, error }) {
  return [
    html`<div class="results" key="results">${
      fields.map((field, i) => html`<${Row} key=${i} field=${field} />`)
    }</div>`,
    error ? html`<p class="error" key="error">${error}</p>` : null,
    fields.length ? html`<p class="hint" key="hint">Click a value to copy it.</p>` : null,
  ];
}

function Row({ field }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(field.value);
    setCopied(true);
    setTimeout(() => setCopied(false), 900);
  };

  // Same byte cycle the bit inputs use, so a result reads like one.
  const bits = field.format === "bits";
  return html`<div class=${copied ? "row copied" : "row"}>
    <span class="label">${field.label}</span
    ><span class=${bits ? "value bits-value" : "value"} title="Click to copy" onClick=${copy}>${
      bits ? byteSpans(field.value, true) : field.value
    }</span>
  </div>`;
}
