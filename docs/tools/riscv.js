// An RV32 instruction is a 32 bit word cut into fields, and which fields it
// has depends on its format:
//
//	R  funct7  rs2   rs1  funct3    rd     opcode
//	I    imm[11:0]   rs1  funct3    rd     opcode
//	S  imm[11:5] rs2 rs1  funct3 imm[4:0]  opcode
//	B  imm[12|10:5] rs2 rs1 funct3 imm[4:1|11] opcode
//	U        imm[31:12]             rd     opcode
//	J     imm[20|10:1|11|19:12]     rd     opcode
//
// The opcode alone says which of the six it is, which is why every tool here
// reads that field first and lets it decide the rest.

export const WORD_BITS = 32;

// Where a field sits in the word: how far left it is shifted, and how wide.
export const FIELDS = {
  funct7: { shift: 25, width: 7 },
  rs2: { shift: 20, width: 5 },
  rs1: { shift: 15, width: 5 },
  funct3: { shift: 12, width: 3 },
  rd: { shift: 7, width: 5 },
  opcode: { shift: 0, width: 7 },
  imm: { shift: 20, width: 12 }, // I-type; U and J override it below
  immHi: { shift: 25, width: 7 }, // S and B
  immLo: { shift: 7, width: 5 }, // S and B
};

// Which fields each format uses, in the order they appear in the word.
export const FORMATS = {
  R: ["funct7", "rs2", "rs1", "funct3", "rd", "opcode"],
  I: ["imm", "rs1", "funct3", "rd", "opcode"],
  S: ["immHi", "rs2", "rs1", "funct3", "immLo", "opcode"],
  B: ["immHi", "rs2", "rs1", "funct3", "immLo", "opcode"],
  U: ["imm", "rd", "opcode"],
  J: ["imm", "rd", "opcode"],
};

// layout is the fields a format lays out, in word order, each with where it
// sits. U and J hand their immediate the top twenty bits, so that one field is
// not the one FIELDS describes.
const IMM_UPPER = { shift: 12, width: 20 };

export function layout(fmt) {
  return FORMATS[fmt].map((id) => [
    id,
    id === "imm" && (fmt === "U" || fmt === "J") ? IMM_UPPER : FIELDS[id],
  ]);
}

// slices is the same layout, as ranges of the 32 character bit pattern a
// decoder reads.
export function slices(fmt) {
  return layout(fmt).map(([id, f]) => [id, [WORD_BITS - f.shift - f.width, WORD_BITS - f.shift]]);
}

// The opcodes the card documents, and the format each one is read in. An
// opcode outside this table is not RV32I, M or A.
export const OPCODES = {
  0b0110011: { name: "OP", fmt: "R" },
  0b0010011: { name: "OP-IMM", fmt: "I" },
  0b0000011: { name: "LOAD", fmt: "I" },
  0b0100011: { name: "STORE", fmt: "S" },
  0b1100011: { name: "BRANCH", fmt: "B" },
  0b1101111: { name: "JAL", fmt: "J" },
  0b1100111: { name: "JALR", fmt: "I" },
  0b0110111: { name: "LUI", fmt: "U" },
  0b0010111: { name: "AUIPC", fmt: "U" },
  0b1110011: { name: "SYSTEM", fmt: "I" },
  0b0001111: { name: "MISC-MEM", fmt: "I" },
  0b0101111: { name: "AMO", fmt: "R" },
};

// formatOf is the format an opcode is read in, or "" when the opcode is not
// one the card lists.
export const formatOf = (opcode) => OPCODES[opcode]?.fmt || "";

// wordFields cuts a full 32 bit pattern — every bit known, none of it a
// decoder's variable letter — into the named bit strings the encoder's boxes
// hold, so a decoded word can be handed straight to the encoder to tweak.
// null when the opcode is not one the card lists: the encoder would have
// nothing to lay the rest of the word out by.
export function wordFields(pattern) {
  const opcode = parseInt(pattern.slice(WORD_BITS - 7), 2);
  const fmt = formatOf(opcode);
  if (!fmt) return null;
  const out = {};
  for (const [id, [from, to]] of slices(fmt)) out[id] = pattern.slice(from, to);
  return out;
}

const bin = (n, width) => (n >>> 0).toString(2).padStart(width, "0").slice(-width);

// applyInstruction fills in the fields an instruction pins down — opcode,
// funct3, and whatever tells it apart from its neighbours — and leaves the
// operands (rd, rs1, rs2, the rest of imm) exactly as they were typed, so
// picking an instruction is a shortcut into the boxes, not a reset of them.
export function applyInstruction(inst, values) {
  values.opcode = bin(inst.opcode, 7);
  if (inst.funct3 !== undefined) values.funct3 = bin(inst.funct3, 3);

  if (inst.fmt === "R") {
    // An atomic hides its funct5 in the top of funct7 and leaves aq/rl free.
    const funct7 = inst.funct7 !== undefined ? inst.funct7 : (inst.funct5 ?? 0) << 2;
    values.funct7 = bin(funct7, 7);
  } else if (inst.imm7 !== undefined) {
    // A shift hides its funct7 in the top of the immediate; shamt is below it.
    const shamt = values.imm ? values.imm.slice(-5) : "00000";
    values.imm = bin(inst.imm7, 7) + shamt;
  } else if (inst.imm !== undefined) {
    // ecall/ebreak: the whole immediate is what tells them apart.
    values.imm = bin(inst.imm, 12);
  }
}

// The registers, in encoding order: ABI name, what it is for, and who is
// expected to preserve it across a call.
export const REGISTERS = [
  ["zero", "Zero constant", "—"],
  ["ra", "Return address", "Callee"],
  ["sp", "Stack pointer", "Callee"],
  ["gp", "Global pointer", "—"],
  ["tp", "Thread pointer", "—"],
  ["t0", "Temporary", "Caller"],
  ["t1", "Temporary", "Caller"],
  ["t2", "Temporary", "Caller"],
  ["s0/fp", "Saved / frame pointer", "Callee"],
  ["s1", "Saved register", "Callee"],
  ["a0", "Fn arg / return value", "Caller"],
  ["a1", "Fn arg / return value", "Caller"],
  ["a2", "Fn arg", "Caller"],
  ["a3", "Fn arg", "Caller"],
  ["a4", "Fn arg", "Caller"],
  ["a5", "Fn arg", "Caller"],
  ["a6", "Fn arg", "Caller"],
  ["a7", "Fn arg", "Caller"],
  ["s2", "Saved register", "Callee"],
  ["s3", "Saved register", "Callee"],
  ["s4", "Saved register", "Callee"],
  ["s5", "Saved register", "Callee"],
  ["s6", "Saved register", "Callee"],
  ["s7", "Saved register", "Callee"],
  ["s8", "Saved register", "Callee"],
  ["s9", "Saved register", "Callee"],
  ["s10", "Saved register", "Callee"],
  ["s11", "Saved register", "Callee"],
  ["t3", "Temporary", "Caller"],
  ["t4", "Temporary", "Caller"],
  ["t5", "Temporary", "Caller"],
  ["t6", "Temporary", "Caller"],
];

// abi is what a register number is called in assembly, e.g. 2 is "sp".
export const abi = (n) => REGISTERS[n]?.[0] || `x${n}`;

// regName spells a register out both ways, e.g. "x2 · sp".
export const regName = (n) => `x${n} · ${abi(n)}`;

// The instruction table. Every entry is matched on its opcode first, then on
// whichever of funct3, funct7, funct5 or the immediate tells it apart from its
// neighbours. `syntax` is how the operands are written when it is not the one
// its format implies, and `desc` is the card's C line, with rd, rs1, rs2 and
// imm standing in for the operands.
export const INSTRUCTIONS = [
  // RV32I — register/register
  { name: "add", fmt: "R", opcode: 0b0110011, funct3: 0x0, funct7: 0x00, desc: "rd = rs1 + rs2" },
  { name: "sub", fmt: "R", opcode: 0b0110011, funct3: 0x0, funct7: 0x20, desc: "rd = rs1 - rs2" },
  { name: "xor", fmt: "R", opcode: 0b0110011, funct3: 0x4, funct7: 0x00, desc: "rd = rs1 ^ rs2" },
  { name: "or", fmt: "R", opcode: 0b0110011, funct3: 0x6, funct7: 0x00, desc: "rd = rs1 | rs2" },
  { name: "and", fmt: "R", opcode: 0b0110011, funct3: 0x7, funct7: 0x00, desc: "rd = rs1 & rs2" },
  { name: "sll", fmt: "R", opcode: 0b0110011, funct3: 0x1, funct7: 0x00, desc: "rd = rs1 << rs2" },
  { name: "srl", fmt: "R", opcode: 0b0110011, funct3: 0x5, funct7: 0x00, desc: "rd = rs1 >> rs2" },
  { name: "sra", fmt: "R", opcode: 0b0110011, funct3: 0x5, funct7: 0x20, desc: "rd = rs1 >> rs2", note: "msb-extends" },
  { name: "slt", fmt: "R", opcode: 0b0110011, funct3: 0x2, funct7: 0x00, desc: "rd = (rs1 < rs2) ? 1 : 0" },
  { name: "sltu", fmt: "R", opcode: 0b0110011, funct3: 0x3, funct7: 0x00, desc: "rd = (rs1 < rs2) ? 1 : 0", note: "zero-extends" },

  // RV32I — register/immediate
  { name: "addi", fmt: "I", opcode: 0b0010011, funct3: 0x0, desc: "rd = rs1 + imm" },
  { name: "xori", fmt: "I", opcode: 0b0010011, funct3: 0x4, desc: "rd = rs1 ^ imm" },
  { name: "ori", fmt: "I", opcode: 0b0010011, funct3: 0x6, desc: "rd = rs1 | imm" },
  { name: "andi", fmt: "I", opcode: 0b0010011, funct3: 0x7, desc: "rd = rs1 & imm" },
  { name: "slli", fmt: "I", opcode: 0b0010011, funct3: 0x1, imm7: 0x00, syntax: "shift", desc: "rd = rs1 << imm" },
  { name: "srli", fmt: "I", opcode: 0b0010011, funct3: 0x5, imm7: 0x00, syntax: "shift", desc: "rd = rs1 >> imm" },
  { name: "srai", fmt: "I", opcode: 0b0010011, funct3: 0x5, imm7: 0x20, syntax: "shift", desc: "rd = rs1 >> imm", note: "msb-extends" },
  { name: "slti", fmt: "I", opcode: 0b0010011, funct3: 0x2, desc: "rd = (rs1 < imm) ? 1 : 0" },
  { name: "sltiu", fmt: "I", opcode: 0b0010011, funct3: 0x3, desc: "rd = (rs1 < imm) ? 1 : 0", note: "zero-extends" },

  // RV32I — loads and stores
  { name: "lb", fmt: "I", opcode: 0b0000011, funct3: 0x0, syntax: "offset", desc: "rd = M[rs1+imm][0:7]" },
  { name: "lh", fmt: "I", opcode: 0b0000011, funct3: 0x1, syntax: "offset", desc: "rd = M[rs1+imm][0:15]" },
  { name: "lw", fmt: "I", opcode: 0b0000011, funct3: 0x2, syntax: "offset", desc: "rd = M[rs1+imm][0:31]" },
  { name: "lbu", fmt: "I", opcode: 0b0000011, funct3: 0x4, syntax: "offset", desc: "rd = M[rs1+imm][0:7]", note: "zero-extends" },
  { name: "lhu", fmt: "I", opcode: 0b0000011, funct3: 0x5, syntax: "offset", desc: "rd = M[rs1+imm][0:15]", note: "zero-extends" },
  { name: "sb", fmt: "S", opcode: 0b0100011, funct3: 0x0, desc: "M[rs1+imm][0:7] = rs2[0:7]" },
  { name: "sh", fmt: "S", opcode: 0b0100011, funct3: 0x1, desc: "M[rs1+imm][0:15] = rs2[0:15]" },
  { name: "sw", fmt: "S", opcode: 0b0100011, funct3: 0x2, desc: "M[rs1+imm][0:31] = rs2[0:31]" },

  // RV32I — branches and jumps
  { name: "beq", fmt: "B", opcode: 0b1100011, funct3: 0x0, desc: "if (rs1 == rs2) PC += imm" },
  { name: "bne", fmt: "B", opcode: 0b1100011, funct3: 0x1, desc: "if (rs1 != rs2) PC += imm" },
  { name: "blt", fmt: "B", opcode: 0b1100011, funct3: 0x4, desc: "if (rs1 < rs2) PC += imm" },
  { name: "bge", fmt: "B", opcode: 0b1100011, funct3: 0x5, desc: "if (rs1 >= rs2) PC += imm" },
  { name: "bltu", fmt: "B", opcode: 0b1100011, funct3: 0x6, desc: "if (rs1 < rs2) PC += imm", note: "zero-extends" },
  { name: "bgeu", fmt: "B", opcode: 0b1100011, funct3: 0x7, desc: "if (rs1 >= rs2) PC += imm", note: "zero-extends" },
  { name: "jal", fmt: "J", opcode: 0b1101111, desc: "rd = PC+4; PC += imm" },
  { name: "jalr", fmt: "I", opcode: 0b1100111, funct3: 0x0, desc: "rd = PC+4; PC = rs1 + imm" },

  // RV32I — upper immediates
  { name: "lui", fmt: "U", opcode: 0b0110111, desc: "rd = imm << 12" },
  { name: "auipc", fmt: "U", opcode: 0b0010111, desc: "rd = PC + (imm << 12)" },

  // RV32I — the environment
  { name: "ecall", fmt: "I", opcode: 0b1110011, funct3: 0x0, imm: 0x0, syntax: "bare", desc: "Transfer control to OS" },
  { name: "ebreak", fmt: "I", opcode: 0b1110011, funct3: 0x0, imm: 0x1, syntax: "bare", desc: "Transfer control to debugger" },
  { name: "fence", fmt: "I", opcode: 0b0001111, funct3: 0x0, syntax: "bare", desc: "Order memory and I/O" },

  // RV32M — the multiply extension, an R-type with funct7 0x01
  { name: "mul", fmt: "R", opcode: 0b0110011, funct3: 0x0, funct7: 0x01, ext: "RV32M", desc: "rd = (rs1 * rs2)[31:0]" },
  { name: "mulh", fmt: "R", opcode: 0b0110011, funct3: 0x1, funct7: 0x01, ext: "RV32M", desc: "rd = (rs1 * rs2)[63:32]" },
  { name: "mulhsu", fmt: "R", opcode: 0b0110011, funct3: 0x2, funct7: 0x01, ext: "RV32M", desc: "rd = (rs1 * rs2)[63:32]", note: "signed × unsigned" },
  { name: "mulhu", fmt: "R", opcode: 0b0110011, funct3: 0x3, funct7: 0x01, ext: "RV32M", desc: "rd = (rs1 * rs2)[63:32]", note: "unsigned" },
  { name: "div", fmt: "R", opcode: 0b0110011, funct3: 0x4, funct7: 0x01, ext: "RV32M", desc: "rd = rs1 / rs2" },
  { name: "divu", fmt: "R", opcode: 0b0110011, funct3: 0x5, funct7: 0x01, ext: "RV32M", desc: "rd = rs1 / rs2", note: "unsigned" },
  { name: "rem", fmt: "R", opcode: 0b0110011, funct3: 0x6, funct7: 0x01, ext: "RV32M", desc: "rd = rs1 % rs2" },
  { name: "remu", fmt: "R", opcode: 0b0110011, funct3: 0x7, funct7: 0x01, ext: "RV32M", desc: "rd = rs1 % rs2", note: "unsigned" },

  // RV32A — the atomics, an R-type whose funct7 is a funct5 with the aq and rl
  // ordering bits underneath it.
  { name: "lr.w", fmt: "R", opcode: 0b0101111, funct3: 0x2, funct5: 0x02, ext: "RV32A", syntax: "amo-load", desc: "rd = M[rs1], reserve M[rs1]" },
  { name: "sc.w", fmt: "R", opcode: 0b0101111, funct3: 0x2, funct5: 0x03, ext: "RV32A", syntax: "amo", desc: "if (reserved) { M[rs1] = rs2; rd = 0 } else { rd = 1 }" },
  { name: "amoswap.w", fmt: "R", opcode: 0b0101111, funct3: 0x2, funct5: 0x01, ext: "RV32A", syntax: "amo", desc: "rd = M[rs1]; swap(rd, rs2); M[rs1] = rd" },
  { name: "amoadd.w", fmt: "R", opcode: 0b0101111, funct3: 0x2, funct5: 0x00, ext: "RV32A", syntax: "amo", desc: "rd = M[rs1] + rs2; M[rs1] = rd" },
  { name: "amoand.w", fmt: "R", opcode: 0b0101111, funct3: 0x2, funct5: 0x0c, ext: "RV32A", syntax: "amo", desc: "rd = M[rs1] & rs2; M[rs1] = rd" },
  { name: "amoor.w", fmt: "R", opcode: 0b0101111, funct3: 0x2, funct5: 0x0a, ext: "RV32A", syntax: "amo", desc: "rd = M[rs1] | rs2; M[rs1] = rd" },
  { name: "amoxor.w", fmt: "R", opcode: 0b0101111, funct3: 0x2, funct5: 0x04, ext: "RV32A", syntax: "amo", desc: "rd = M[rs1] ^ rs2; M[rs1] = rd" },
  { name: "amomax.w", fmt: "R", opcode: 0b0101111, funct3: 0x2, funct5: 0x14, ext: "RV32A", syntax: "amo", desc: "rd = max(M[rs1], rs2); M[rs1] = rd" },
  { name: "amomin.w", fmt: "R", opcode: 0b0101111, funct3: 0x2, funct5: 0x10, ext: "RV32A", syntax: "amo", desc: "rd = min(M[rs1], rs2); M[rs1] = rd" },
];

// The syntax each format falls back to when an entry does not name its own.
const DEFAULT_SYNTAX = { R: "reg", I: "imm", S: "store", B: "branch", U: "upper", J: "jump" };

export const syntaxOf = (inst) => inst.syntax || DEFAULT_SYNTAX[inst.fmt];

// find looks an instruction up by the fields that tell it apart. Every one of
// them is optional: what the caller does not know, it leaves out, and an entry
// that needs it is then not a match.
export function find({ opcode, funct3, funct7, imm }) {
  return INSTRUCTIONS.find((inst) => {
    if (inst.opcode !== opcode) return false;
    if (inst.funct3 !== undefined && inst.funct3 !== funct3) return false;
    if (inst.funct7 !== undefined && inst.funct7 !== funct7) return false;
    // An atomic reads the top five bits of funct7 and leaves aq and rl free.
    if (inst.funct5 !== undefined && (funct7 === undefined || inst.funct5 !== funct7 >> 2)) return false;
    // A shift hides its funct7 in the top of the immediate.
    if (inst.imm7 !== undefined && (imm === undefined || inst.imm7 !== imm >> 5)) return false;
    if (inst.imm !== undefined && inst.imm !== imm) return false;
    return true;
  }) || null;
}

// signExtend reads a width bit two's complement field as a signed number.
export function signExtend(value, width) {
  const sign = 1 << (width - 1);
  return (value & (sign - 1)) - (value & sign);
}

// immediateOf reassembles the immediate a format scatters over the word. B and
// J leave bit 0 out — their offsets are always even — so the value handed back
// is the offset in bytes, not the bits as they sit in the word.
export function immediateOf(fmt, f) {
  switch (fmt) {
    case "I":
      return signExtend(f.imm, 12);
    case "S":
      return signExtend((f.immHi << 5) | f.immLo, 12);
    case "B": {
      const bits = (((f.immHi >> 6) & 1) << 12) | ((f.immLo & 1) << 11) |
        ((f.immHi & 0x3f) << 5) | (f.immLo & 0x1e);
      return signExtend(bits, 13);
    }
    case "U":
      // The field is imm[31:12]: the value it stands for is already shifted.
      return signExtend(f.imm, 20) * 0x1000;
    case "J": {
      const bits = (((f.imm >> 19) & 1) << 20) | ((f.imm & 0xff) << 12) |
        (((f.imm >> 8) & 1) << 11) | (((f.imm >> 9) & 0x3ff) << 1);
      return signExtend(bits, 21);
    }
    default:
      return 0;
  }
}

// IMM_SOURCE says where the pieces of a scattered immediate came from.
export const IMM_SOURCE = {
  I: "imm[11:0], sign extended",
  S: "imm[11:5] and imm[4:0], sign extended",
  B: "imm[12|10:5] and imm[4:1|11] — bit 0 is always 0, so the offset is even",
  U: "imm[31:12] — the low twelve bits are zero",
  J: "imm[20|10:1|11|19:12] — bit 0 is always 0, so the offset is even",
};

// immediateText is how an immediate reads on the results line: the value it
// stands for, and where the bits it was built from came from.
export function immediateText(fmt, f, shift) {
  if (shift) return `${f.imm & 0x1f} — imm[4:0], and imm[11:5] = ${hex(f.imm >> 5)} picks the shift`;
  const value = immediateOf(fmt, f);
  if (fmt === "U") {
    const shifted = (value >>> 0).toString(16).toUpperCase().padStart(8, "0");
    return `${hex(f.imm)} << 12 = 0x${shifted} (${value}) — ${IMM_SOURCE[fmt]}`;
  }
  return `${value} (${hex(value >>> 0)}) — ${IMM_SOURCE[fmt]}`;
}

// amoSuffix is the ordering the low two bits of an atomic's funct7 ask for.
export function amoSuffix(funct7) {
  return (funct7 & 2 ? ".aq" : "") + (funct7 & 1 ? ".rl" : "");
}

const hex = (n) => "0x" + n.toString(16).toUpperCase();

// operands writes the operand list the way the instruction is normally
// written. The values are text, not numbers, so a decoder can hand over the
// letter of a field it could not pin down.
export function operands(inst, { rd, rs1, rs2, imm }) {
  switch (syntaxOf(inst)) {
    case "reg": return `${rd}, ${rs1}, ${rs2}`;
    case "imm": return `${rd}, ${rs1}, ${imm}`;
    case "shift": return `${rd}, ${rs1}, ${imm}`;
    case "offset": return `${rd}, ${imm}(${rs1})`;
    case "store": return `${rs2}, ${imm}(${rs1})`;
    case "branch": return `${rs1}, ${rs2}, ${imm}`;
    case "upper": return `${rd}, ${imm}`;
    case "jump": return `${rd}, ${imm}`;
    case "amo": return `${rd}, ${rs2}, (${rs1})`;
    case "amo-load": return `${rd}, (${rs1})`;
    default: return "";
  }
}

// assembly is the whole line, mnemonic and operands.
export function assembly(inst, ops) {
  const rest = operands(inst, ops);
  return rest === "" ? inst.name : `${inst.name} ${rest}`;
}

// effect is the card's C line with the operands filled in.
export function effect(inst, { rd, rs1, rs2, imm }) {
  return inst.desc
    .replace(/\b(rd|rs1|rs2|imm)\b/g, (token) => ({ rd, rs1, rs2, imm })[token])
    // A negative immediate lands after the plus the card wrote: "sp + -16"
    // is the same subtraction, spelled the long way round.
    .replace(/\+ -/g, "- ");
}

// wordBits renders a word as bits, one group per byte, the way the results
// line shows them.
export function wordBits(word) {
  let out = "";
  for (let i = WORD_BITS - 1; i >= 0; i--) {
    out += (word >>> i) & 1;
    if (i % 8 === 0 && i !== 0) out += " ";
  }
  return out;
}

// hexWord is the eight digit hex a word is usually quoted as.
export const hexWord = (word) => "0x" + word.toString(16).toUpperCase().padStart(8, "0");
