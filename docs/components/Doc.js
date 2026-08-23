// Reference cards have no input: the registry hands over sections and the
// colours to paint them with, matching the field colours of the encoders.

import { html } from "../lib/html.js";
import { useFold } from "./folds.js";
import { colorVar } from "./bits.js";

export function Doc({ sections, path }) {
  const out = [];
  let groups = 0;
  for (const section of sections) {
    if (section.kind === "group") {
      out.push(html`<${DocGroup} key=${section.title} section=${section} path=${path}
                                 closedByDefault=${groups++ > 0} />`);
      continue;
    }
    if (section.title) out.push(html`<p class="doc-title" key=${"t" + section.title}>${section.title}</p>`);
    out.push(html`<${Section} key=${"s" + (section.title || section.kind)} section=${section} />`);
  }
  return html`<div class="doc">${out}</div>`;
}

// DocGroup folds a run of sections away behind its own heading, remembered
// under the card it belongs to.
function DocGroup({ section, path, closedByDefault }) {
  const key = `${path}/${section.title}`;
  const [open, toggle] = useFold(key, closedByDefault);
  return html`
    <section class=${open ? "doc-group" : "doc-group folded"}>
      <button type="button" class="doc-group-head" aria-expanded=${String(open)} onClick=${toggle}>
        <span class="chevron">▸</span><span class="doc-group-title">${section.title}</span>
      </button>
      <div class="doc-group-body" hidden=${!open}>
        ${section.text ? html`<p class="desc">${section.text}</p>` : null}
        <${Doc} sections=${section.sections || []} path=${key} />
      </div>
    </section>`;
}

function Section({ section }) {
  switch (section.kind) {
    case "layout":
      return html`<p class="doc-layout">${[...section.text].map((ch, i) => {
        const color = (section.colors || {})[ch];
        return html`<span key=${i} style=${color ? `color:${colorVar(color)}` : null}>${ch}</span>`;
      })}</p>`;
    case "legend":
    case "table":
      return section.compact ? html`<${CompactTable} section=${section} />`
                             : html`<${Table} section=${section} />`;
    case "grid":
      return html`<${Grid} section=${section} />`;
    default:
      return html`<p class="doc-note">${section.text}</p>`;
  }
}

function Table({ section }) {
  const cells = [];
  (section.rows || []).forEach((row, i) => {
    cells.push(html`<dt key=${"k" + i} class="doc-key"
                        style=${row.color ? `color:${colorVar(row.color)}` : null}>${row.key}</dt>`);
    cells.push(html`<dd key=${"v" + i} class="doc-value">${row.value}</dd>`);
  });
  return html`<dl class=${section.kind === "legend" ? "doc-legend" : "doc-table"}>${cells}</dl>`;
}

// CompactTable flows a long list over as many columns as fit. The column width
// follows the longest entry, so short opcode names pack tight while spelled out
// jump conditions still get a readable column.
function CompactTable({ section }) {
  const rows = section.rows || [];
  const longest = rows.reduce((n, r) => Math.max(n, r.key.length + r.value.length), 0);
  const width = Math.max(7, longest * 0.52).toFixed(1);
  return html`<div class="doc-compact" style=${`column-width:${width}rem`}>${rows.map((row, i) => html`
    <p class="doc-entry" key=${i}><span class="doc-key" style=${row.color ? `color:${colorVar(row.color)}` : null}>${row.key}</span><span class="doc-value">${row.value}</span></p>`)}</div>`;
}

// Grid is a reference table with columns of its own: the instruction tables of
// a RISC-V card are read column by column — mnemonic, format, opcode, funct3 —
// and a two column key/value list cannot hold that. Each column carries the
// colour its field wears in the encoder, so an opcode is the same red wherever
// it is read.
function Grid({ section }) {
  const columns = section.columns || [];
  const head = columns.map((column, i) => html`<th key=${i} class=${column.mono ? "mono" : null}>${column.label}</th>`);
  const rows = (section.rows || []).map((row, i) => html`
    <tr key=${i}>${columns.map((column, j) => html`
      <td key=${j} class=${column.mono ? "mono" : null}
          style=${column.color ? `color:${colorVar(column.color)}` : null}>${row[j]}</td>`)}
    </tr>`);
  return html`<div class="doc-grid-scroll">
    <table class="doc-grid"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>
  </div>`;
}
