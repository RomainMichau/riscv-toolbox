// The decoder reads a word back. Bits it cannot know are welcome: any letter
// stands for a variable, so a pattern lifted straight out of a table —
// 0000000rrrrrsssss000ddddd0110011 — decodes into the fields it does pin down,
// and names the letters for the rest.
//
// The opcode is read first: until it is known there is no telling which format
// the word is in, and so no telling where the other fields even are.

import { cleanBits, parseDigits } from "./bits.js";
import * as rv from "./riscv.js";

const UINT64_MAX = (1n << 64n) - 1n;
const UINT32_MAX = (1n << 32n) - 1n;

// The label each field is shown under.
const LABELS = {
  funct7: "funct7", funct3: "funct3", rd: "rd", rs1: "rs1", rs2: "rs2",
  imm: "imm", immHi: "imm high", immLo: "imm low", opcode: "opcode",
};

// parseNumber reads a literal the way a C compiler would: the prefix picks the
// base, a bare leading zero means octal, and no sign is allowed. Returns null
// when the text is not a number at all.
function parseNumber(text) {
  if (text === "") return null;
  let radix = 10;
  let digits = text;
  if (text.startsWith("0x")) [radix, digits] = [16, text.slice(2)];
  else if (text.startsWith("0b")) [radix, digits] = [2, text.slice(2)];
  else if (text.startsWith("0o")) [radix, digits] = [8, text.slice(2)];
  else if (text.length > 1 && text[0] === "0") [radix, digits] = [8, text.slice(1)];

  const value = parseDigits(digits, radix);
  if (value === null || value > UINT64_MAX) return null;
  return value;
}

// wordPattern turns the input into exactly 32 characters of bits and variables.
function wordPattern(text, read) {
  if (read === "number") {
    const value = parseNumber(text.toLowerCase());
    if (value === null) {
      throw new Error(`${JSON.stringify(text)} is not a number — try 7537331 or 0x007302B3`);
    }
    if (value > UINT32_MAX) {
      throw new Error(`${text} does not fit in a 32 bit word`);
    }
    return value.toString(2).padStart(rv.WORD_BITS, "0");
  }

  for (let i = 0; i < text.length; i++) {
    const r = text[i];
    const bit = r === "0" || r === "1";
    const letter = (r >= "a" && r <= "z") || (r >= "A" && r <= "Z");
    if (!bit && !letter) {
      throw new Error(`${JSON.stringify(r)} at position ${i + 1} is neither a bit nor a variable`);
    }
  }
  if (text.length > rv.WORD_BITS) {
    throw new Error(`${text.length} bits given, a word is ${rv.WORD_BITS}`);
  }
  // A short pattern is read as the low bits of the word, like a number is.
  return "0".repeat(rv.WORD_BITS - text.length) + text;
}

// value reads a run of the pattern, and says whether it was all bits.
function value(slice) {
  if (!/^[01]+$/.test(slice)) return [0, false];
  return [parseInt(slice, 2), true];
}

// variableName is the letter a field is filled with, or the raw run when it is
// a mix of bits and letters.
function variableName(slice) {
  const first = slice[0];
  return [...slice].every((c) => c === first) ? first : slice;
}

const unknown = (slice) => `variable ${variableName(slice)}`;

const hex = (n, digits) => "0x" + n.toString(16).toUpperCase().padStart(digits, "0");

// register spells a register field out both ways, with what it is normally
// used for.
function register(slice) {
  const [n, ok] = value(slice);
  if (!ok) return unknown(slice);
  return `${rv.regName(n)} — ${rv.REGISTERS[n][1]}`;
}

export function decodeRiscv(input) {
  const text = cleanBits(input.word || "");
  if (text === "") return [];

  const pattern = wordPattern(text, input.read);
  const fields = [{ label: "Bits", value: pattern, format: "bits" }];

  // Every other field's position hangs off the opcode, so a word whose opcode
  // is not known cannot be cut up at all.
  const opAt = pattern.slice(rv.WORD_BITS - 7);
  const [opcode, opKnown] = value(opAt);
  if (!opKnown) {
    fields.push(
      { label: "Opcode", value: unknown(opAt) },
      { label: "Format", value: "the opcode picks the format, and so where every other field sits" },
      { label: "Instruction", value: "needs the opcode to be known" },
    );
    return fields;
  }

  const known = rv.OPCODES[opcode];
  const fmt = known ? known.fmt : "R";
  fields.push({ label: "Opcode", value: known ? `${opAt} · ${known.name}` : `${opAt} — not an opcode the card lists` });
  fields.push({
    label: "Format",
    value: known ? `${fmt} · ${rv.FORMATS[fmt].map((id) => LABELS[id]).join(" | ")}`
                 : "unknown — shown cut up the R-type way",
  });

  // Cut the word up the way this format says, keeping both what each field
  // holds and the text to show when it holds a variable.
  const f = {}; // numeric value, 0 where unknown
  const at = {}; // the raw slice
  let allKnown = true;
  for (const [id, [from, to]] of rv.slices(fmt)) {
    at[id] = pattern.slice(from, to);
    const [n, ok] = value(at[id]);
    f[id] = n;
    if (!ok) allKnown = false;
  }

  // A field this format does not have reads as known: there is nothing in it
  // to be unsure about.
  const readable = (id) => !(id in at) || /^[01]+$/.test(at[id]);

  for (const id of ["funct7", "funct3"]) {
    if (id in at) {
      const digits = Math.ceil(at[id].length / 4);
      fields.push({ label: id, value: readable(id) ? `${at[id]} · ${hex(f[id], digits)}` : unknown(at[id]) });
    }
  }
  for (const id of ["rd", "rs1", "rs2"]) {
    if (id in at) fields.push({ label: id, value: register(at[id]) });
  }

  // What tells one instruction from another: the opcode, funct3, funct7, and
  // for a shift the top of the immediate. A field this word does not have is
  // left out, and one it does have but cannot read holds the answer back.
  const selectors = ["funct3", "funct7", "imm"].filter((id) => id in at);
  const inst = selectors.every(readable)
    ? rv.find({ opcode, funct3: f.funct3, funct7: f.funct7, imm: f.imm })
    : null;

  const immFields = ["imm", "immHi", "immLo"].filter((id) => id in at);
  const shift = inst ? rv.syntaxOf(inst) === "shift" : false;
  if (immFields.length) {
    fields.push({
      label: "Immediate",
      value: immFields.every(readable)
        ? rv.immediateText(fmt, f, shift)
        : immFields.map((id) => `${LABELS[id]}: ${readable(id) ? at[id] : unknown(at[id])}`).join(", "),
    });
  }

  if (!inst) {
    fields.push({
      label: "Instruction",
      value: selectors.every(readable)
        ? "no instruction on the card has these fields"
        : `needs ${selectors.filter((id) => !readable(id)).map((id) => LABELS[id]).join(" and ")} to be known`,
    });
    return fields;
  }

  // Operands the word does not pin down are written as the letter standing for
  // them, so the shape of the instruction still reads.
  const operand = (id, text) => (readable(id) ? text : variableName(at[id]));

  const immOp = immFields.every(readable)
    ? (shift ? String(f.imm & 0x1f)
      : fmt === "U" ? hex(f.imm, 1)
      : String(rv.immediateOf(fmt, f)))
    : immFields.map((id) => (readable(id) ? at[id] : variableName(at[id]))).join("|");
  const ops = {
    rd: operand("rd", rv.abi(f.rd)),
    rs1: operand("rs1", rv.abi(f.rs1)),
    rs2: operand("rs2", rv.abi(f.rs2)),
    imm: immOp,
  };
  const named = inst.ext === "RV32A" ? { ...inst, name: inst.name + rv.amoSuffix(f.funct7) } : inst;

  fields.push(
    { label: "Instruction", value: rv.assembly(named, ops) },
    { label: "Effect", value: rv.effect(inst, ops) + (inst.note ? ` — ${inst.note}` : "") },
  );
  if (!allKnown) {
    fields.push({ label: "Note", value: "the letters above stand for bits the pattern left open" });
  }
  return fields;
}
