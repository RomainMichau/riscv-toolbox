// One fixed width box per field of the word, laid out on a single line and
// colour coded. Typing overwrites the bit under the caret and walks forward
// into the next field, so a word can be filled in one go.
//
// This is plain DOM on purpose. Every keystroke here is about the caret — where
// it sits, which box it moves to next, where it lands again after the row
// changes shape — and a caret is not state a renderer can hold for you. The
// widget owns its subtree and only reports the values back up.

import { COLORS } from "./bits.js";
import { on } from "../lib/bus.js";

function text(tag, className, content) {
  const el = document.createElement(tag);
  el.className = className;
  el.textContent = content;
  return el;
}

// mountSegments fills host with the row and keeps it in step with the layout
// the values ask for: the Symphony immediate flag, say, hands the last two
// bytes to argument B. Values carry over the switch, so what has been typed
// survives it. Returns the teardown.
export function mountSegments(host, tool, onValues) {
  const values = {}; // id -> bits, shared by every rebuild
  let layout = null;
  let row = null;

  // A variant is picked by what one field holds: `equals` for a single value,
  // `oneOf` when several spellings ask for the same shape — the five RISC-V
  // opcodes that are all read as an I-type, say.
  const matches = (when) => {
    const held = values[when.input];
    return when.oneOf ? when.oneOf.includes(held) : held === when.equals;
  };

  const wanted = () => {
    for (const variant of tool.variants || []) {
      if (matches(variant.when)) return variant.inputs;
    }
    return tool.inputs;
  };

  // changed runs after every keystroke: relayout if the word changed shape,
  // then hand the values up.
  const changed = () => {
    if (wanted() !== layout) build(activeSegment());
    onValues({ ...values });
  };

  const rowHost = document.createElement("div");

  const build = (focus) => {
    layout = wanted();
    row = segmentRow(layout, values, changed);
    rowHost.replaceChildren(row.el);
    if (focus) row.restore(focus);
  };

  host.replaceChildren();
  // The picker is a shortcut into the same fields typing reaches: it only
  // ever sets values and asks for a rebuild, same as a keystroke does.
  if (tool.instructions) {
    host.append(instructionPicker(tool.instructions, (inst) => {
      const before = { ...values };
      tool.applyInstruction(inst, values);
      changed();
      // Send the caret to the first field the instruction did not pin down,
      // so filling in the operands can start right away. "Pinned down" is
      // whatever applyInstruction actually touched — there is no fixed list
      // of field names here, that would only hold for one instruction set.
      const pinned = new Set(Object.keys(values).filter((id) => values[id] !== before[id]));
      const next = layout.find((spec) => spec.id && !pinned.has(spec.id));
      if (next) row.restore({ id: next.id, caret: 0 });
    }));
  }
  host.append(rowHost);

  build(null);
  onValues({ ...values }); // all zeroes is already a valid word

  // Another card — the decoder, handing over a word it just read — can load
  // values in wholesale, the same as typing or the instruction picker would.
  const offLoad = on(`load:${tool.id}`, (loaded) => {
    Object.assign(values, loaded);
    changed();
  });

  return () => {
    host.replaceChildren();
    offLoad();
  };
}

let pickerSeq = 0;

// instructionPicker is a type-ahead over the instruction names: pick one and
// its opcode (and funct3/funct7) land in the boxes below, in whatever shape
// that instruction's format asks for.
function instructionPicker(instructions, onPick) {
  const id = `inst-picker-${pickerSeq++}`;
  const wrap = document.createElement("label");
  wrap.className = "inst-picker";

  const list = document.createElement("datalist");
  list.id = id;
  instructions.forEach((inst) => {
    const opt = document.createElement("option");
    opt.value = inst.name;
    list.append(opt);
  });

  const input = document.createElement("input");
  input.type = "text";
  input.spellcheck = false;
  input.autocomplete = "off";
  input.placeholder = "add, addi, lw, beq…";
  input.setAttribute("list", id);

  const byName = new Map(instructions.map((inst) => [inst.name, inst]));
  input.addEventListener("change", () => {
    const inst = byName.get(input.value.trim().toLowerCase());
    input.value = "";
    if (inst) onPick(inst);
  });

  wrap.append(text("span", "choice-label", "instruction"), input, list);
  return wrap;
}

// activeSegment remembers where the caret is, to put it back after a rebuild.
function activeSegment() {
  const el = document.activeElement;
  return el && el.dataset && el.dataset.id ? { id: el.dataset.id, caret: el.selectionStart } : null;
}

// fit trims or zero pads a value to a width, keeping the low bits — argument B
// holds the same number whether it is 4 or 16 bits wide.
function fit(bits, width) {
  return bits.length > width ? bits.slice(bits.length - width) : bits.padStart(width, "0");
}

function segmentRow(specs, values, changed) {
  const el = document.createElement("div");
  el.className = "segments";

  const editable = [];
  const ids = [];
  let bits = 0;

  specs.forEach((spec, i) => {
    const cell = document.createElement("label");
    cell.className = spec.id ? "seg" : "seg seg-fixed";
    const color = COLORS.includes(spec.color) ? spec.color : "muted";
    cell.style.setProperty("--seg", `var(--c-${color})`);

    const box = document.createElement("input");
    box.type = "text";
    box.spellcheck = false;
    box.autocomplete = "off";
    box.value = spec.value || "0".repeat(spec.width);
    // 1ch per bit is not enough: the tracking between the digits counts too,
    // and the box still needs its padding on top of that.
    box.style.width = `calc(${spec.width} * (1ch + var(--seg-track)) + 1.5rem)`;
    box.dataset.width = spec.width;
    if (spec.id) {
      box.dataset.id = spec.id;
      if (spec.id in values) box.value = fit(values[spec.id], spec.width);
      values[spec.id] = box.value;
      editable.push(box);
      ids.push(spec.id);
    } else {
      box.readOnly = true;
      box.tabIndex = -1;
    }

    cell.append(box, text("span", "seg-label", spec.label || "×"));
    el.append(cell);

    bits += spec.width;
    if (bits % 8 === 0 && i < specs.length - 1) {
      el.append(text("span", "byte-gap", ""));
    }
  });

  wireSegments(editable, () => {
    ids.forEach((id, i) => (values[id] = editable[i].value));
    changed();
  });

  const restore = ({ id, caret }) => {
    const box = editable[ids.indexOf(id)];
    if (!box) return;
    box.focus();
    const at = Math.min(caret, box.value.length);
    box.setSelectionRange(at, at);
  };
  return { el, restore };
}

function wireSegments(boxes, changed) {
  const width = (box) => Number(box.dataset.width);

  const focusAt = (i, pos) => {
    const box = boxes[i];
    box.focus();
    box.setSelectionRange(pos, pos);
  };

  const write = (i, pos, bit) => {
    const box = boxes[i];
    box.value = box.value.slice(0, pos) + bit + box.value.slice(pos + 1);
    changed();
  };

  // typeBit overwrites the bit at pos and moves on, spilling into the next
  // field when this one is full.
  const typeBit = (i, pos, bit) => {
    if (pos >= width(boxes[i])) {
      if (i + 1 >= boxes.length) return;
      return typeBit(i + 1, 0, bit);
    }
    write(i, pos, bit);
    if (pos + 1 < width(boxes[i])) focusAt(i, pos + 1);
    else if (i + 1 < boxes.length) focusAt(i + 1, 0);
    else focusAt(i, pos + 1);
  };

  boxes.forEach((box, i) => {
    box.addEventListener("keydown", (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const pos = box.selectionStart;

      switch (e.key) {
        case "0":
        case "1":
          e.preventDefault();
          typeBit(i, pos, e.key);
          return;
        case "Backspace":
          e.preventDefault();
          if (pos > 0) {
            write(i, pos - 1, "0");
            focusAt(i, pos - 1);
          } else if (i > 0) {
            const prev = width(boxes[i - 1]) - 1;
            write(i - 1, prev, "0");
            focusAt(i - 1, prev);
          }
          return;
        case "Delete":
          e.preventDefault();
          if (pos < width(box)) write(i, pos, "0");
          return;
        case "ArrowLeft":
          if (pos === 0 && i > 0) {
            e.preventDefault();
            focusAt(i - 1, width(boxes[i - 1]));
          }
          return;
        case "ArrowRight":
          if (pos === width(box) && i + 1 < boxes.length) {
            e.preventDefault();
            focusAt(i + 1, 0);
          }
          return;
      }
      if (e.key.length === 1) e.preventDefault(); // bits only
    });

    // Pasting a run of bits fills this field and the ones after it.
    box.addEventListener("paste", (e) => {
      e.preventDefault();
      const bits = (e.clipboardData || window.clipboardData).getData("text").replace(/[^01]/g, "");
      let at = i;
      let pos = box.selectionStart;
      for (const bit of bits) {
        if (pos >= width(boxes[at])) {
          if (++at >= boxes.length) break;
          pos = 0;
        }
        write(at, pos++, bit);
      }
      focusAt(at, Math.min(pos, width(boxes[at])));
    });
  });
}
