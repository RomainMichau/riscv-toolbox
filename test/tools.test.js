// A readable pass over the behaviour the README promises. The exhaustive
// checking of the number converter lives in golden.test.js; the instruction
// cases here are hand-checked against the reference card and against what an
// assembler emits.

import test from "node:test";
import assert from "node:assert/strict";

import { run } from "../docs/tools/index.js";
import { INSTRUCTIONS, layout, wordFields } from "../docs/tools/riscv.js";

const values = (id, inputs) =>
  Object.fromEntries(run(id, inputs).fields.map((f) => [f.label, f.value]));

// bits writes a number as a field of the given width, the way a box holds it.
const bits = (n, width) => (n >>> 0).toString(2).padStart(width, "0");

// encode fills the boxes of one format and reads the answer back.
const encode = (fields) => values("riscv-encode", Object.fromEntries(
  Object.entries(fields).map(([id, [n, width]]) => [id, bits(n, width)]),
));

const decode = (word) => values("riscv-decode", { word, read: "number" });

test("the number converter guesses how to read what you type", () => {
  // Nothing but 0 and 1 is taken as bits, at the width it was typed.
  assert.equal(values("number", { value: "1100 1101" })["Read as"], "binary, 8 bits (1 byte)");
  // A prefix settles it.
  assert.equal(values("number", { value: "0xCD" })["Read as"], "hex, 8 bits (1 byte)");
  // Anything else is decimal, at the narrowest whole number of bytes.
  assert.equal(values("number", { value: "205" })["Read as"], "decimal, 8 bits (1 byte)");
  // And the Read as buttons override the guess.
  assert.equal(values("number", { value: "1100 1101", base: "dec" })["Read as"],
    "decimal, 24 bits (3 bytes)");
});

test("separators are ignored and negatives come out in two's complement", () => {
  assert.equal(values("number", { value: "1100_1101" }).Decimal, "205");
  assert.equal(values("number", { value: "-5" }).Hex, "0xFB");
  assert.equal(values("number", { value: "11111111" })["Signed (8-bit two's complement)"], "-1");
});

test("a half typed value is not an error", () => {
  assert.deepEqual(run("number", { value: "" }), { fields: [], error: "" });
  assert.deepEqual(run("number", { value: "0x" }), { fields: [], error: "" });
  assert.deepEqual(run("riscv-decode", { word: "", read: "bits" }), { fields: [], error: "" });
});

test("the encoder lays an R-type out into a word", () => {
  // add t0, t1, t2
  const got = encode({
    opcode: [0b0110011, 7], funct3: [0x0, 3], funct7: [0x00, 7],
    rd: [5, 5], rs1: [6, 5], rs2: [7, 5],
  });
  assert.equal(got.Hex, "0x007302B3");
  assert.equal(got.Int, "7537331");
  assert.equal(got.Bits, "00000000 01110011 00000010 10110011");
  assert.equal(got.Format, "R · OP");
  assert.equal(got.Instruction, "add t0, t1, t2");
  assert.equal(got.Effect, "t0 = t1 + t2");
});

test("the Registers toggle spells rd/rs1/rs2 out with their x-number too", () => {
  // add t0, t1, t2 — same word as above, with the toggle flipped to id+abi.
  const got = values("riscv-encode", {
    regFormat: "id",
    opcode: bits(0b0110011, 7), funct3: bits(0x0, 3), funct7: bits(0x00, 7),
    rd: bits(5, 5), rs1: bits(6, 5), rs2: bits(7, 5),
  });
  assert.equal(got.Instruction, "add x5 · t0, x6 · t1, x7 · t2");
  assert.equal(got.Effect, "x5 · t0 = x6 · t1 + x7 · t2");
});

test("the opcode picks the format, and the immediate is read the way it says", () => {
  // addi a0, sp, -16 — one field, sign extended.
  const addi = encode({ opcode: [0b0010011, 7], funct3: [0x0, 3], rd: [10, 5], rs1: [2, 5], imm: [0xFF0, 12] });
  assert.equal(addi.Hex, "0xFF010513");
  assert.equal(addi.Instruction, "addi a0, sp, -16");
  assert.equal(addi.Effect, "a0 = sp - 16");

  // sw a0, 12(sp) — imm[11:5] and imm[4:0], on either side of the registers.
  const sw = encode({
    opcode: [0b0100011, 7], funct3: [0x2, 3], rs1: [2, 5], rs2: [10, 5],
    immHi: [12 >> 5, 7], immLo: [12 & 0x1f, 5],
  });
  assert.equal(sw.Hex, "0x00A12623");
  assert.equal(sw.Instruction, "sw a0, 12(sp)");

  // beq a0, zero, -16 — imm[12|10:5] and imm[4:1|11], and bit 0 is not stored.
  const beq = encode({
    opcode: [0b1100011, 7], funct3: [0x0, 3], rs1: [10, 5], rs2: [0, 5],
    immHi: [0b1111111, 7], immLo: [0b10001, 5],
  });
  assert.equal(beq.Hex, "0xFE0508E3");
  assert.equal(beq.Instruction, "beq a0, zero, -16");

  // lui ra, 0x12345 — the field is the top twenty bits of the value.
  const lui = encode({ opcode: [0b0110111, 7], rd: [1, 5], imm: [0x12345, 20] });
  assert.equal(lui.Hex, "0x123450B7");
  assert.equal(lui.Instruction, "lui ra, 0x12345");
  assert.equal(lui.Immediate, "0x12345 << 12 = 0x12345000 (305418240) — imm[31:12] — the low twelve bits are zero");
});

test("boxes left over from the last format do not leak into the word", () => {
  // funct7 is an R-type field; a U-type has no room for it and must ignore it.
  const lui = encode({ opcode: [0b0110111, 7], rd: [1, 5], imm: [0x12345, 20], funct7: [0x7f, 7] });
  assert.equal(lui.Hex, "0x123450B7");
});

test("the shifts hide their funct7 in the top of the immediate", () => {
  const fields = { opcode: [0b0010011, 7], funct3: [0x5, 3], rd: [10, 5], rs1: [10, 5] };
  const srli = encode({ ...fields, imm: [(0x00 << 5) | 4, 12] });
  const srai = encode({ ...fields, imm: [(0x20 << 5) | 4, 12] });
  assert.equal(srli.Instruction, "srli a0, a0, 4");
  assert.equal(srai.Instruction, "srai a0, a0, 4");
  assert.equal(srai.Effect, "a0 = a0 >> 4 — msb-extends");
  assert.equal(srli.Immediate, "4 — imm[4:0], and imm[11:5] = 0x0 picks the shift");
});

test("an atomic wears the ordering its low two funct7 bits ask for", () => {
  // amoadd.w.aq a0, a1, (sp): funct5 0x00, aq set.
  const got = encode({
    opcode: [0b0101111, 7], funct3: [0x2, 3], funct7: [(0x00 << 2) | 0b10, 7],
    rd: [10, 5], rs1: [2, 5], rs2: [11, 5],
  });
  assert.equal(got.Instruction, "amoadd.w.aq a0, a1, (sp)");
});

test("an opcode the card does not list says so rather than guessing", () => {
  const got = encode({ opcode: [0b1111111, 7] });
  assert.equal(got.Format, "1111111 is not an opcode the card lists");
  assert.equal(got.Instruction, "no instruction on the card has these fields");
});

test("the decoder reads a word back into its fields", () => {
  const got = decode("0x00A00513"); // addi a0, zero, 10 — what li a0, 10 becomes
  assert.equal(got.Opcode, "0010011 · OP-IMM");
  assert.equal(got.Format, "I · imm | rs1 | funct3 | rd | opcode");
  assert.equal(got.rd, "x10 · a0 — Fn arg / return value");
  assert.equal(got.rs1, "x0 · zero — Zero constant");
  assert.equal(got.Instruction, "addi a0, zero, 10");
});

test("the decoder and the encoder agree, whichever way round you go", () => {
  for (const word of ["0x007302B3", "0x00A12623", "0xFE0508E3", "0x123450B7", "0x0000006F", "0x00100073"]) {
    const got = decode(word);
    assert.equal(got.Bits.length, 32, word);
    assert.ok(got.Instruction && !got.Instruction.startsWith("no instruction"), `${word}: ${got.Instruction}`);
  }
  assert.equal(decode("0x00100073").Instruction, "ebreak");
  assert.equal(decode("0x0000006F").Instruction, "jal zero, 0");
});

test("a 0x prefix reads as a number even when the toggle is left on bits", () => {
  const got = values("riscv-decode", { word: "0x00A00513", read: "bits" });
  assert.equal(got.Instruction, "addi a0, zero, 10");
});

test("the Hex mode reads plain hex digits, with or without a 0x", () => {
  assert.equal(values("riscv-decode", { word: "00A00513", read: "hex" }).Instruction, "addi a0, zero, 10");
  assert.equal(values("riscv-decode", { word: "0x00A00513", read: "hex" }).Instruction, "addi a0, zero, 10");
  assert.equal(run("riscv-decode", { word: "00G0", read: "hex" }).error,
    `"00G0" is not a hex number — try 007302B3 or 0x007302B3`);
});

test("wordFields cuts a decoded word into the boxes the encoder holds, and the encoder reads them back the same way", () => {
  // add t0, t1, t2 — round tripped from a decoded word into the encoder.
  const decoded = values("riscv-decode", { word: "0x007302B3", read: "hex" });
  const fields = wordFields(decoded.Bits);
  assert.deepEqual(fields, {
    funct7: "0000000", rs2: "00111", rs1: "00110", funct3: "000", rd: "00101", opcode: "0110011",
  });
  assert.equal(values("riscv-encode", fields).Instruction, "add t0, t1, t2");

  // An opcode not on the card cannot be laid out, so there is nothing to send.
  assert.equal(wordFields("1".repeat(32)), null);
});

test("the decoder reads a table pattern, letters and all", () => {
  const got = values("riscv-decode",
    { word: "0000000 rrrrr sssss 000 ddddd 0110011", read: "bits" });
  assert.equal(got.rd, "variable d");
  assert.equal(got.rs1, "variable s");
  assert.equal(got.rs2, "variable r");
  assert.equal(got.Instruction, "add d, s, r");
  assert.equal(got.Effect, "d = s + r");
});

test("a word whose opcode is unknown cannot be cut up at all", () => {
  // Until the opcode is read there is no telling where the other fields sit.
  const got = values("riscv-decode", { word: "0".repeat(25) + "ooooooo", read: "bits" });
  assert.equal(got.Opcode, "variable o");
  assert.equal(got.Instruction, "needs the opcode to be known");
});

test("a selector the decoder cannot pin down holds the answer back", () => {
  const got = values("riscv-decode", { word: "0000000" + "0".repeat(10) + "fff" + "0".repeat(5) + "0110011", read: "bits" });
  assert.equal(got.funct3, "variable f");
  assert.equal(got.Instruction, "needs funct3 to be known");
});

test("a short pattern is read as the low bits of the word", () => {
  const got = values("riscv-decode", { word: "0110011", read: "bits" });
  assert.equal(got.Bits, "0".repeat(25) + "0110011");
  assert.equal(got.Instruction, "add zero, zero, zero");
});

test("what is not a bit is pointed at", () => {
  assert.equal(run("riscv-decode", { word: "0000!!!!", read: "bits" }).error,
    `"!" at position 5 is neither a bit nor a variable`);
  assert.equal(run("riscv-decode", { word: "0".repeat(33), read: "bits" }).error,
    "33 bits given, a word is 32");
});

test("every instruction on the card encodes and decodes back to its own name", () => {
  // A word built out of an entry's own selectors has to come back named after
  // it — that is the whole contract between the two tools, over all 57 rows.
  for (const inst of INSTRUCTIONS) {
    const boxes = { opcode: [inst.opcode, 7], rd: [10, 5], rs1: [11, 5], rs2: [12, 5] };
    if (inst.funct3 !== undefined) boxes.funct3 = [inst.funct3, 3];
    const funct7 = inst.funct7 ?? (inst.funct5 !== undefined ? inst.funct5 << 2 : 0);
    const imm = inst.imm ?? (inst.imm7 !== undefined ? (inst.imm7 << 5) | 4 : 0);
    for (const [id, spec] of layout(inst.fmt)) {
      if (id === "funct7") boxes.funct7 = [funct7, 7];
      if (id === "imm") boxes.imm = [imm, spec.width];
      if (id === "immHi") boxes.immHi = [imm >> 5, 7];
      if (id === "immLo") boxes.immLo = [imm & 0x1f, 5];
    }

    const encoded = encode(boxes);
    const named = decode(encoded.Hex);
    const mnemonic = (line) => line.split(" ")[0];
    assert.equal(mnemonic(encoded.Instruction), inst.name, `${inst.name} encodes`);
    assert.equal(mnemonic(named.Instruction), inst.name, `${inst.name} decodes from ${encoded.Hex}`);
    assert.equal(named.Bits.replace(/ /g, ""), encoded.Bits.replace(/ /g, ""), `${inst.name} round trip`);
  }
});
