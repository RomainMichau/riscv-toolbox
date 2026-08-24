// The encoder: one box per field of the word, and the integer to feed the
// machine underneath. The opcode is the field that matters most — it decides
// which format the rest of the word is read in, so the row of boxes changes
// shape as soon as you type it.

import { cleanBits } from "./bits.js";
import * as rv from "./riscv.js";

// bitsField reads one named bit field, defaulting to 0 when it is missing.
function bitsField(input, id, width) {
  const raw = input[id] || "";
  const bits = cleanBits(raw);
  if (bits === "") return 0;
  if (bits.length > width) {
    throw new Error(`${id}: ${bits.length} bits given, field is ${width} bits wide`);
  }
  if (!/^[01]+$/.test(bits)) {
    throw new Error(`${id}: ${JSON.stringify(raw)} is not a binary value`);
  }
  return parseInt(bits, 2);
}

export function encodeRiscv(input) {
  const opcode = bitsField(input, "opcode", rv.FIELDS.opcode.width);
  const known = rv.OPCODES[opcode];
  // An opcode the card does not list still has to be read as something, and
  // R is the layout that keeps every field separate.
  const fmt = known ? known.fmt : "R";

  // Only the fields this format lays out are read: the boxes of the format
  // last on screen keep their values, and must not leak into this word.
  const f = {};
  let word = 0;
  for (const [id, spec] of rv.layout(fmt)) {
    f[id] = bitsField(input, id, spec.width);
    word |= f[id] << spec.shift;
  }
  word >>>= 0;

  const fields = [
    { label: "Int", value: String(word) },
    { label: "Hex", value: rv.hexWord(word) },
    { label: "Bits", value: rv.wordBits(word), format: "bits" },
    {
      label: "Format",
      value: known ? `${fmt} · ${known.name}` : `${opcode.toString(2).padStart(7, "0")} is not an opcode the card lists`,
    },
  ];

  const inst = known ? rv.find({ opcode, funct3: f.funct3, funct7: f.funct7, imm: f.imm }) : null;
  if (!inst) {
    fields.push({ label: "Instruction", value: "no instruction on the card has these fields" });
    return fields;
  }

  const shift = rv.syntaxOf(inst) === "shift";
  // How the immediate is written as an operand: a shift counts bits, an upper
  // immediate is quoted as the field itself, and everything else as the value
  // the scattered pieces add up to.
  const immOp = shift ? String(f.imm & 0x1f)
    : fmt === "U" ? "0x" + f.imm.toString(16).toUpperCase()
    : String(rv.immediateOf(fmt, f));
  // "Registers" toggle: the ABI name alone, as an assembler expects, or with
  // its x-number in front for anyone reading the boxes register by register.
  const regText = input.regFormat === "id" ? rv.regName : rv.abi;
  const ops = { rd: regText(f.rd), rs1: regText(f.rs1), rs2: regText(f.rs2), imm: immOp };
  // The atomics carry their ordering in the two bits under the funct5.
  const named = inst.ext === "RV32A" ? { ...inst, name: inst.name + rv.amoSuffix(f.funct7) } : inst;

  fields.push(
    { label: "Instruction", value: rv.assembly(named, ops) },
    { label: "Effect", value: rv.effect(inst, ops) + (inst.note ? ` — ${inst.note}` : "") },
  );
  if (fmt !== "R") {
    fields.push({ label: "Immediate", value: rv.immediateText(fmt, f, shift) });
  }
  return fields;
}
