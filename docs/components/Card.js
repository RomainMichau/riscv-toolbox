// One collapsible card per tool. A tool either takes input and computes
// something, or is pure reference documentation.

import { html } from "../lib/html.js";
import { useState, useMemo } from "preact/hooks";
import { useFold } from "./folds.js";
import { Doc } from "./Doc.js";
import { InputForm } from "./Inputs.js";
import { Segmented } from "./Segmented.js";
import { Results } from "./Results.js";
import { run } from "../tools/index.js";

// defaults are what the boxes hold before anything is typed: the picked choice,
// or a field's worth of zeroes. Filler segments have no id and no value to keep.
function defaults(tool) {
  const out = {};
  for (const spec of tool.inputs || []) {
    if (!spec.id) continue;
    if (spec.kind === "choice") out[spec.id] = spec.value || (spec.options || [])[0]?.id || "";
    else if (spec.width) out[spec.id] = spec.value || "0".repeat(spec.width);
    else out[spec.id] = spec.value || "";
  }
  return out;
}

export function Card({ tool, closedByDefault }) {
  const [open, toggle] = useFold(tool.id, closedByDefault);
  const [values, setValues] = useState(() => defaults(tool));

  const inputs = tool.inputs || []; // documentation cards have none
  // A word cut into fixed width fields gets the segmented row; a choice with
  // no width of its own (an output toggle, say) sits above it as a plain
  // form control instead.
  // Memoized on inputs' identity, stable for the tool's lifetime: Segmented
  // rebuilds its DOM whenever the tool object it is given changes identity,
  // so segTool below must not be a fresh object on every render.
  const segFields = useMemo(() => inputs.filter((i) => i.width), [inputs]);
  const choiceFields = useMemo(() => inputs.filter((i) => !i.width), [inputs]);
  const segmented = segFields.length > 0;
  const segTool = useMemo(
    () => (choiceFields.length ? { ...tool, inputs: segFields } : tool),
    [tool, segFields, choiceFields],
  );

  // Nothing is in flight any more: the answer is a function of the values, so
  // it is worked out on the way to the screen. No sequence guard, no await.
  const res = tool.doc ? null : run(tool.id, values);

  const onChange = (id, v) => setValues((was) => ({ ...was, [id]: v }));

  let field;
  if (tool.doc) {
    field = html`<${Doc} sections=${tool.doc} path=${tool.id} />`;
  } else if (segmented) {
    // The segmented widget reports its own fields wholesale on every keystroke;
    // merge rather than replace, so a choice control's value survives it.
    const onSegValues = (v) => setValues((was) => ({ ...was, ...v }));
    field = html`
      ${choiceFields.length ? html`<${InputForm} inputs=${choiceFields} values=${values} onChange=${onChange} />` : null}
      <${Segmented} tool=${segTool} onValues=${onSegValues} />`;
  } else {
    field = html`<${InputForm} inputs=${inputs} values=${values} onChange=${onChange} />`;
  }

  const classes = ["tool"];
  if (tool.doc || segmented) classes.push("wide");
  if (!open) classes.push("folded");

  return html`
    <section class=${classes.join(" ")}>
      <button type="button" class="tool-head" aria-expanded=${String(open)} onClick=${toggle}>
        <span class="chevron">▸</span><span class="tool-title">${tool.name}</span>
      </button>
      <div class="tool-body" hidden=${!open}>
        <p class="desc">${tool.description}</p>
        ${field}
        ${res ? html`<${Results} fields=${res.fields} error=${res.error} />` : null}
      </div>
    </section>`;
}
