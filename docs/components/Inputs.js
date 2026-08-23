// A tool without a segmented word gets a small form instead: a text box, and
// any number of choices to go with it.

import { html } from "../lib/html.js";
import { useState, useRef, useLayoutEffect } from "preact/hooks";
import { byteSpans } from "./bits.js";

const SEPARATOR = /[\s_|]/g;

export function InputForm({ inputs, values, onChange }) {
  return html`<div class="form">${inputs.map((spec) =>
    spec.kind === "choice"
      ? html`<${Choice} key=${spec.id} spec=${spec} picked=${values[spec.id]}
                        onPick=${(v) => onChange(spec.id, v)} />`
      : html`<${FreeInput} key=${spec.id} spec=${spec}
                           onInput=${(v) => onChange(spec.id, v)} />`,
  )}</div>`;
}

// "bits" is a word that may hold variables, "binary" is a run of bits and
// nothing else — see byteSpans for why the two are told apart.
function FreeInput({ spec, onInput }) {
  if (spec.format === "bits" || spec.format === "binary") {
    return html`<${BitInput} spec=${spec} letters=${spec.format === "bits"} onInput=${onInput} />`;
  }
  return html`<input type="text" spellcheck="false" autocomplete="off"
                     placeholder=${spec.placeholder || ""}
                     onInput=${(e) => onInput(e.currentTarget.value)} />`;
}

// BitInput draws a layer of coloured spans on top of a transparent input, so
// the native caret, selection and scrolling are kept. The input stays
// uncontrolled: the caret is the browser's business, not the renderer's.
function BitInput({ spec, letters, onInput }) {
  const [text, setText] = useState("");
  const input = useRef(null);
  const layer = useRef(null);

  const sync = () => {
    if (layer.current && input.current) layer.current.scrollLeft = input.current.scrollLeft;
  };
  useLayoutEffect(sync);

  const changed = () => {
    stripSeparators(input.current);
    setText(input.current.value);
    onInput(input.current.value);
  };

  return html`<div class="bitfield">
    <input ref=${input} type="text" spellcheck="false" autocomplete="off"
           placeholder=${spec.placeholder || ""} onInput=${changed} onScroll=${sync} />
    <div ref=${layer} class="bits-layer" aria-hidden="true">${byteSpans(text, false, letters)}</div>
  </div>`;
}

// stripSeparators removes anything a paste may have brought in between the
// bits, keeping the caret on the same bit. Characters that are neither bits nor
// separators are left in place so the error line can point at them.
function stripSeparators(input) {
  const raw = input.value;
  const clean = raw.replace(SEPARATOR, "");
  if (clean === raw) return;
  const caret = raw.slice(0, input.selectionStart).replace(SEPARATOR, "").length;
  input.value = clean;
  input.setSelectionRange(caret, caret);
}

// Choice is a row of buttons acting as radio buttons: one is always on, and
// clicking another swaps it.
function Choice({ spec, picked, onPick }) {
  return html`<div class="choice" role="radiogroup" aria-label=${spec.label || null}>
    ${spec.label ? html`<span class="choice-label">${spec.label}</span>` : null}
    ${(spec.options || []).map((option) => html`
      <button key=${option.id} type="button" class="choice-option" role="radio"
              aria-checked=${String(option.id === picked)}
              onClick=${() => option.id !== picked && onPick(option.id)}>${option.label}</button>`)}
  </div>`;
}
