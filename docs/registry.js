// The tool descriptors: static data describing what each tool shows.
//
// The instruction tables are not written out here — they are built from the
// same INSTRUCTIONS table the encoder and the decoder read, so the reference
// and the answers can never drift apart.

import { INSTRUCTIONS, REGISTERS, FIELDS, wordFields, applyInstruction } from "./tools/riscv.js";

const hex = (n, digits) => "0x" + n.toString(16).toUpperCase().padStart(digits, "0");
const bin = (n, width) => n.toString(2).padStart(width, "0");

// The colours a field wears, used by the encoder boxes, the format layouts and
// the reference columns alike.
const COLOR = {
  opcode: "red",
  funct3: "orange",
  funct7: "orange",
  rd: "yellow",
  rs1: "green",
  rs2: "blue",
  imm: "purple",
};

// The letters the format layouts are drawn with.
const LAYOUT_COLORS = {
  "7": COLOR.funct7,
  "3": COLOR.funct3,
  "2": COLOR.rs2,
  "1": COLOR.rs1,
  d: COLOR.rd,
  o: COLOR.opcode,
  i: COLOR.imm,
};

const layout = (title, text, note) => [
  { title, kind: "layout", text, colors: LAYOUT_COLORS },
  ...(note ? [{ kind: "note", text: note }] : []),
];

// instRows turns instruction entries into reference rows. Whatever field tells
// an entry apart from its neighbours goes in the funct7 column, named, since
// that is where the card puts it.
const instRows = (list) => list.map((i) => [
  i.name,
  i.fmt,
  bin(i.opcode, 7),
  i.funct3 === undefined ? "" : hex(i.funct3, 1),
  i.funct7 !== undefined ? hex(i.funct7, 2)
    : i.funct5 !== undefined ? `funct5 ${hex(i.funct5, 2)}`
    : i.imm7 !== undefined ? `imm[11:5] ${hex(i.imm7, 2)}`
    : i.imm !== undefined ? `imm ${hex(i.imm, 1)}`
    : "",
  i.desc,
  i.note || "",
]);

const INST_COLUMNS = [
  { label: "Inst", mono: true },
  { label: "FMT", color: "muted" },
  { label: "Opcode", mono: true, color: COLOR.opcode },
  { label: "funct3", mono: true, color: COLOR.funct3 },
  { label: "funct7", mono: true, color: COLOR.funct7 },
  { label: "Description (C)", mono: true },
  { label: "Note", color: "muted" },
];

const instGrid = (list) => ({ kind: "grid", columns: INST_COLUMNS, rows: instRows(list) });

const base = INSTRUCTIONS.filter((i) => !i.ext);
const byExt = (ext) => INSTRUCTIONS.filter((i) => i.ext === ext);

// seg is one box of the encoder row: the field it edits, how wide it is, and
// the colour it shares with the reference.
const seg = (id, label, width, color) => ({ id, label, width, color });

const OPCODE_SEG = seg("opcode", "opcode", FIELDS.opcode.width, COLOR.opcode);
const RD_SEG = seg("rd", "rd", FIELDS.rd.width, COLOR.rd);
const RS1_SEG = seg("rs1", "rs1", FIELDS.rs1.width, COLOR.rs1);
const RS2_SEG = seg("rs2", "rs2", FIELDS.rs2.width, COLOR.rs2);
const FUNCT3_SEG = seg("funct3", "funct3", FIELDS.funct3.width, COLOR.funct3);

// The opcodes that share a format, so one variant can cover them all.
const I_OPCODES = ["0010011", "0000011", "1100111", "1110011", "0001111"];
const U_OPCODES = ["0110111", "0010111"];

export const TOOLS = [
  {
    id: "number",
    name: "Number Converter",
    family: "General",
    description: "Binary, decimal, hex and octal, all at once. Prefixes and separators are understood, and negatives come out in two's complement.",
    inputs: [
      { id: "value", placeholder: "1100 1101, 205, 0xCD…", format: "binary" },
      {
        id: "base",
        label: "Read as",
        kind: "choice",
        options: [
          { id: "auto", label: "Auto" },
          { id: "bin", label: "Binary" },
          { id: "dec", label: "Decimal" },
          { id: "hex", label: "Hex" },
          { id: "oct", label: "Octal" },
        ],
        value: "auto",
      },
    ],
  },
  {
    id: "riscv-doc",
    name: "Instruction Doc",
    family: "RISC-V",
    description: "The six word formats, the registers, and every instruction on the reference card — one fold per part.",
    doc: [
      {
        title: "Formats",
        kind: "group",
        text: "A word is 32 bits cut into fields, and the opcode says which cut. Six formats, differing only in how much room the immediate gets and where its pieces are hidden.",
        sections: [
          ...layout("R — register, register", "7777777 22222 11111 333 ddddd ooooooo",
            "Two source registers and a destination. funct3 and funct7 together pick the operation the opcode's family performs."),
          ...layout("I — register, immediate", "iiiiiiiiiiii 11111 333 ddddd ooooooo",
            "The immediate is imm[11:0] in one piece, sign extended. It is also where the shifts hide their funct7: imm[11:5] tells srli from srai, and imm[4:0] is the shift amount."),
          ...layout("S — store", "iiiiiii 22222 11111 333 iiiii ooooooo",
            "The immediate is split so that rs1, rs2 and funct3 never move: imm[11:5] on the left, imm[4:0] on the right, sign extended together."),
          ...layout("B — branch", "iiiiiii 22222 11111 333 iiiii ooooooo",
            "The same split as S, shuffled: imm[12|10:5] on the left, imm[4:1|11] on the right. Bit 0 is not stored at all — a branch target is always even — so the offset reaches twice as far."),
          ...layout("U — upper immediate", "iiiiiiiiiiiiiiiiiiii ddddd ooooooo",
            "The immediate is imm[31:12]: the top twenty bits of a value whose low twelve are zero. An addi afterwards fills those in."),
          ...layout("J — jump", "iiiiiiiiiiiiiiiiiiii ddddd ooooooo",
            "The same twenty bits, scrambled into imm[20|10:1|11|19:12] so that as many of them as possible sit where S and B already put them. Bit 0 is dropped, as in a branch."),
          {
            title: "Fields",
            kind: "legend",
            rows: [
              { key: "o", value: "opcode — bits 6:0, and the field everything else hangs off", color: COLOR.opcode },
              { key: "3", value: "funct3 — bits 14:12", color: COLOR.funct3 },
              { key: "7", value: "funct7 — bits 31:25", color: COLOR.funct7 },
              { key: "d", value: "rd — destination register, bits 11:7", color: COLOR.rd },
              { key: "1", value: "rs1 — first source register, bits 19:15", color: COLOR.rs1 },
              { key: "2", value: "rs2 — second source register, bits 24:20", color: COLOR.rs2 },
              { key: "i", value: "imm — the immediate, wherever this format keeps it", color: COLOR.imm },
            ],
          },
          {
            kind: "note",
            text: "Every layout is written most significant bit first, bit 31 on the left. The fields are drawn in the same colours the encoder paints its boxes.",
          },
          {
            title: "Opcodes by format",
            kind: "grid",
            columns: [
              { label: "Opcode", mono: true, color: COLOR.opcode },
              { label: "Name", mono: true },
              { label: "FMT", color: "muted" },
              { label: "Instructions" },
            ],
            rows: [
              ["0110011", "OP", "R", "add, sub, and the rest of the register arithmetic — plus all of RV32M"],
              ["0010011", "OP-IMM", "I", "addi, the shifts, the set-less-thans"],
              ["0000011", "LOAD", "I", "lb, lh, lw, lbu, lhu"],
              ["0100011", "STORE", "S", "sb, sh, sw"],
              ["1100011", "BRANCH", "B", "beq, bne, blt, bge, bltu, bgeu"],
              ["1101111", "JAL", "J", "jal"],
              ["1100111", "JALR", "I", "jalr"],
              ["0110111", "LUI", "U", "lui"],
              ["0010111", "AUIPC", "U", "auipc"],
              ["1110011", "SYSTEM", "I", "ecall, ebreak"],
              ["0001111", "MISC-MEM", "I", "fence"],
              ["0101111", "AMO", "R", "the RV32A atomics"],
            ],
          },
        ],
      },
      {
        title: "Registers",
        kind: "group",
        text: "Thirty-two of them, all the same width, and x0 is wired to zero. The ABI name is what assembly is written in; the saver column is the calling convention, not the hardware.",
        sections: [
          {
            kind: "grid",
            columns: [
              { label: "Register", mono: true },
              { label: "ABI Name", mono: true, color: COLOR.rd },
              { label: "Description" },
              { label: "Saver", color: "muted" },
            ],
            rows: REGISTERS.map(([name, desc, saver], n) => [`x${n}`, name, desc, saver]),
          },
          {
            kind: "note",
            text: "The floating point file mirrors it: f0-7 are ft0-7 and f28-31 are ft8-11 (temporaries, caller saved), f8-9 and f18-27 are fs0-1 and fs2-11 (saved, callee), f10-11 are fa0-1 (arguments and return values) and f12-17 are fa2-7 (arguments), all caller saved.",
          },
        ],
      },
      {
        title: "RV32I",
        kind: "group",
        text: "The base integer set: forty instructions, and everything else is an extension on top.",
        sections: [
          instGrid(base),
          {
            kind: "note",
            text: "The shifts take their shift amount from imm[4:0], and use imm[11:5] the way an R-type uses funct7: 0x00 for the logical shift, 0x20 for the arithmetic one.",
          },
        ],
      },
      {
        title: "RV32M",
        kind: "group",
        text: "The multiply extension: eight more R-types on the OP opcode, told apart by a funct7 of 0x01.",
        sections: [
          instGrid(byExt("RV32M")),
          {
            kind: "note",
            text: "The three high multiplies differ in how their operands are read — mulh signed by signed, mulhsu signed by unsigned, mulhu unsigned by unsigned — and all three hand back the top half of the 64 bit product.",
          },
        ],
      },
      {
        title: "RV32A",
        kind: "group",
        text: "The atomics: read, change and write back a word of memory without anything getting in between.",
        sections: [
          {
            title: "Layout",
            kind: "layout",
            text: "77777 aq rl 22222 11111 333 ddddd ooooooo",
            colors: LAYOUT_COLORS,
          },
          {
            kind: "note",
            text: "An atomic is an R-type whose funct7 is really a five bit funct5 with two ordering bits underneath: aq (acquire) means no later access may be seen to happen first, rl (release) means no earlier one may be seen to happen after.",
          },
          instGrid(byExt("RV32A")),
          {
            kind: "note",
            text: "lr.w and sc.w are the pair to build anything else out of: reserve an address, then store to it and be told whether the reservation survived. The encoder writes the aq and rl suffixes onto the mnemonic when their bits are set.",
          },
        ],
      },
      {
        title: "RV32F / D",
        kind: "group",
        text: "The floating point extensions. The card lists what they do, not how they are encoded, so the encoder and decoder here do not know them.",
        sections: [
          {
            kind: "grid",
            columns: [
              { label: "Inst", mono: true },
              { label: "Name" },
              { label: "Description (C)", mono: true },
            ],
            rows: [
              ["flw", "Flt Load Word", "rd = M[rs1 + imm]"],
              ["fsw", "Flt Store Word", "M[rs1 + imm] = rs2"],
              ["fmadd.s", "Flt Fused Mul-Add", "rd = rs1 * rs2 + rs3"],
              ["fmsub.s", "Flt Fused Mul-Sub", "rd = rs1 * rs2 - rs3"],
              ["fnmadd.s", "Flt Neg Fused Mul-Add", "rd = -rs1 * rs2 + rs3"],
              ["fnmsub.s", "Flt Neg Fused Mul-Sub", "rd = -rs1 * rs2 - rs3"],
              ["fadd.s", "Flt Add", "rd = rs1 + rs2"],
              ["fsub.s", "Flt Sub", "rd = rs1 - rs2"],
              ["fmul.s", "Flt Mul", "rd = rs1 * rs2"],
              ["fdiv.s", "Flt Div", "rd = rs1 / rs2"],
              ["fsqrt.s", "Flt Square Root", "rd = sqrt(rs1)"],
              ["fsgnj.s", "Flt Sign Injection", "rd = abs(rs1) * sgn(rs2)"],
              ["fsgnjn.s", "Flt Sign Neg Injection", "rd = abs(rs1) * -sgn(rs2)"],
              ["fsgnjx.s", "Flt Sign Xor Injection", "rd = rs1 * sgn(rs2)"],
              ["fmin.s", "Flt Minimum", "rd = min(rs1, rs2)"],
              ["fmax.s", "Flt Maximum", "rd = max(rs1, rs2)"],
              ["fcvt.s.w", "Flt Conv from Sign Int", "rd = (float) rs1"],
              ["fcvt.s.wu", "Flt Conv from Uns Int", "rd = (float) rs1"],
              ["fcvt.w.s", "Flt Convert to Int", "rd = (int32_t) rs1"],
              ["fcvt.wu.s", "Flt Convert to Int", "rd = (uint32_t) rs1"],
              ["fmv.x.w", "Move Float to Int", "rd = *((int*) &rs1)"],
              ["fmv.w.x", "Move Int to Float", "rd = *((float*) &rs1)"],
              ["feq.s", "Float Equality", "rd = (rs1 == rs2) ? 1 : 0"],
              ["flt.s", "Float Less Than", "rd = (rs1 < rs2) ? 1 : 0"],
              ["fle.s", "Float Less / Equal", "rd = (rs1 <= rs2) ? 1 : 0"],
              ["fclass.s", "Float Classify", "rd = 0..9"],
            ],
          },
          {
            kind: "note",
            text: "The .s suffix is single precision; RV32D spells the same list with .d and double width registers.",
          },
        ],
      },
      {
        title: "RV32C",
        kind: "group",
        text: "The compressed extension: the most common instructions again, in sixteen bits instead of thirty-two.",
        sections: [
          {
            title: "Formats",
            kind: "grid",
            columns: [
              { label: "FMT", color: "muted" },
              { label: "Fields, bit 15 down to bit 0", mono: true },
            ],
            rows: [
              ["CR", "funct4 | rd/rs1 | rs2 | op"],
              ["CI", "funct3 | imm | rd/rs1 | imm | op"],
              ["CSS", "funct3 | imm | rs2 | op"],
              ["CIW", "funct3 | imm | rd' | op"],
              ["CL", "funct3 | imm | rs1' | imm | rd' | op"],
              ["CS", "funct3 | imm | rd'/rs1' | imm | rs2' | op"],
              ["CB", "funct3 | imm | rs1' | imm | op"],
              ["CJ", "funct3 | offset | op"],
            ],
          },
          {
            kind: "note",
            text: "A primed register name is one of the eight most used registers, x8 to x15, addressed in three bits instead of five. That, and the immediates being both small and pre-scaled, is where the other sixteen bits come from.",
          },
          {
            kind: "grid",
            columns: [
              { label: "Inst", mono: true },
              { label: "Name" },
              { label: "FMT", color: "muted" },
              { label: "OP", mono: true, color: COLOR.opcode },
              { label: "Funct", mono: true, color: COLOR.funct3 },
              { label: "Expands to", mono: true },
            ],
            rows: [
              ["c.lwsp", "Load Word from SP", "CI", "10", "010", "lw rd, (4*imm)(sp)"],
              ["c.swsp", "Store Word to SP", "CSS", "10", "110", "sw rs2, (4*imm)(sp)"],
              ["c.lw", "Load Word", "CL", "00", "010", "lw rd', (4*imm)(rs1')"],
              ["c.sw", "Store Word", "CS", "00", "110", "sw rs2', (4*imm)(rs1')"],
              ["c.j", "Jump", "CJ", "01", "101", "jal x0, 2*offset"],
              ["c.jal", "Jump And Link", "CJ", "01", "001", "jal ra, 2*offset"],
              ["c.jr", "Jump Reg", "CR", "10", "1000", "jalr x0, rs1, 0"],
              ["c.jalr", "Jump And Link Reg", "CR", "10", "1001", "jalr ra, rs1, 0"],
              ["c.beqz", "Branch == 0", "CB", "01", "110", "beq rs', x0, 2*imm"],
              ["c.bnez", "Branch != 0", "CB", "01", "111", "bne rs', x0, 2*imm"],
              ["c.li", "Load Immediate", "CI", "01", "010", "addi rd, x0, imm"],
              ["c.lui", "Load Upper Imm", "CI", "01", "011", "lui rd, imm"],
              ["c.addi", "ADD Immediate", "CI", "01", "000", "addi rd, rd, imm"],
              ["c.addi16sp", "ADD Imm * 16 to SP", "CI", "01", "011", "addi sp, sp, 16*imm"],
              ["c.addi4spn", "ADD Imm * 4 + SP", "CIW", "00", "000", "addi rd', sp, 4*imm"],
              ["c.slli", "Shift Left Logical Imm", "CI", "10", "000", "slli rd, rd, imm"],
              ["c.srli", "Shift Right Logical Imm", "CB", "01", "100x00", "srli rd', rd', imm"],
              ["c.srai", "Shift Right Arith Imm", "CB", "01", "100x01", "srai rd', rd', imm"],
              ["c.andi", "AND Imm", "CB", "01", "100x10", "andi rd', rd', imm"],
              ["c.mv", "MoVe", "CR", "10", "1000", "add rd, x0, rs2"],
              ["c.add", "ADD", "CR", "10", "1001", "add rd, rd, rs2"],
              ["c.and", "AND", "CS", "01", "10001111", "and rd', rd', rs2'"],
              ["c.or", "OR", "CS", "01", "10001110", "or rd', rd', rs2'"],
              ["c.xor", "XOR", "CS", "01", "10001101", "xor rd', rd', rs2'"],
              ["c.sub", "SUB", "CS", "01", "10001100", "sub rd', rd', rs2'"],
              ["c.nop", "No OPeration", "CI", "01", "000", "addi x0, x0, 0"],
              ["c.ebreak", "Environment BREAK", "CR", "10", "1001", "ebreak"],
            ],
          },
          {
            kind: "note",
            text: "These are sixteen bit words. The encoder and the decoder on this page read thirty-two bit ones, so they will not make sense of a compressed instruction.",
          },
        ],
      },
      {
        title: "Pseudo-instructions",
        kind: "group",
        text: "Names an assembler accepts that no opcode answers to: each one is a real instruction with an operand pinned to something convenient, usually x0.",
        sections: [
          {
            kind: "grid",
            columns: [
              { label: "Pseudoinstruction", mono: true },
              { label: "Base instruction(s)", mono: true },
              { label: "Meaning" },
            ],
            rows: [
              ["la rd, symbol", "auipc rd, symbol[31:12] ; addi rd, rd, symbol[11:0]", "Load address"],
              ["l{b|h|w|d} rd, symbol", "auipc rd, symbol[31:12] ; l{b|h|w|d} rd, symbol[11:0](rd)", "Load global"],
              ["s{b|h|w|d} rd, symbol, rt", "auipc rt, symbol[31:12] ; s{b|h|w|d} rd, symbol[11:0](rt)", "Store global"],
              ["fl{w|d} rd, symbol, rt", "auipc rt, symbol[31:12] ; fl{w|d} rd, symbol[11:0](rt)", "Floating-point load global"],
              ["fs{w|d} rd, symbol, rt", "auipc rt, symbol[31:12] ; fs{w|d} rd, symbol[11:0](rt)", "Floating-point store global"],
              ["nop", "addi x0, x0, 0", "No operation"],
              ["li rd, immediate", "Myriad sequences", "Load immediate"],
              ["mv rd, rs", "addi rd, rs, 0", "Copy register"],
              ["not rd, rs", "xori rd, rs, -1", "One's complement"],
              ["neg rd, rs", "sub rd, x0, rs", "Two's complement"],
              ["negw rd, rs", "subw rd, x0, rs", "Two's complement word (RV64)"],
              ["sext.w rd, rs", "addiw rd, rs, 0", "Sign extend word (RV64)"],
              ["seqz rd, rs", "sltiu rd, rs, 1", "Set if = zero"],
              ["snez rd, rs", "sltu rd, x0, rs", "Set if ≠ zero"],
              ["sltz rd, rs", "slt rd, rs, x0", "Set if < zero"],
              ["sgtz rd, rs", "slt rd, x0, rs", "Set if > zero"],
              ["fmv.s rd, rs", "fsgnj.s rd, rs, rs", "Copy single-precision register"],
              ["fabs.s rd, rs", "fsgnjx.s rd, rs, rs", "Single-precision absolute value"],
              ["fneg.s rd, rs", "fsgnjn.s rd, rs, rs", "Single-precision negate"],
              ["fmv.d rd, rs", "fsgnj.d rd, rs, rs", "Copy double-precision register"],
              ["fabs.d rd, rs", "fsgnjx.d rd, rs, rs", "Double-precision absolute value"],
              ["fneg.d rd, rs", "fsgnjn.d rd, rs, rs", "Double-precision negate"],
              ["beqz rs, offset", "beq rs, x0, offset", "Branch if = zero"],
              ["bnez rs, offset", "bne rs, x0, offset", "Branch if ≠ zero"],
              ["blez rs, offset", "bge x0, rs, offset", "Branch if ≤ zero"],
              ["bgez rs, offset", "bge rs, x0, offset", "Branch if ≥ zero"],
              ["bltz rs, offset", "blt rs, x0, offset", "Branch if < zero"],
              ["bgtz rs, offset", "blt x0, rs, offset", "Branch if > zero"],
              ["bgt rs, rt, offset", "blt rt, rs, offset", "Branch if >"],
              ["ble rs, rt, offset", "bge rt, rs, offset", "Branch if ≤"],
              ["bgtu rs, rt, offset", "bltu rt, rs, offset", "Branch if >, unsigned"],
              ["bleu rs, rt, offset", "bgeu rt, rs, offset", "Branch if ≤, unsigned"],
              ["j offset", "jal x0, offset", "Jump"],
              ["jal offset", "jal x1, offset", "Jump and link"],
              ["jr rs", "jalr x0, rs, 0", "Jump register"],
              ["jalr rs", "jalr x1, rs, 0", "Jump and link register"],
              ["ret", "jalr x0, x1, 0", "Return from subroutine"],
              ["call offset", "auipc x1, offset[31:12] ; jalr x1, x1, offset[11:0]", "Call far-away subroutine"],
              ["tail offset", "auipc x6, offset[31:12] ; jalr x0, x6, offset[11:0]", "Tail call far-away subroutine"],
              ["fence", "fence iorw, iorw", "Fence on all memory and I/O"],
            ],
          },
          {
            kind: "note",
            text: "Two of them are why x0 exists at all: reading it gives zero, and writing to it throws the answer away, which is how a jump becomes a plain jump and a compare becomes a test.",
          },
        ],
      },
    ],
  },
  {
    id: "riscv-encode",
    name: "Instruction Encoder",
    family: "RISC-V",
    description: "Build an instruction bit by bit and read the word to feed the machine. Type the opcode first — or pick an instruction by name and let it fill the opcode in — and the row of boxes changes shape to match.",
    instructions: INSTRUCTIONS,
    applyInstruction,
    inputs: [
      {
        id: "regFormat",
        label: "Registers",
        kind: "choice",
        options: [
          { id: "abi", label: "ABI name" },
          { id: "id", label: "ID + ABI name" },
        ],
        value: "abi",
      },
      seg("funct7", "funct7", FIELDS.funct7.width, COLOR.funct7),
      RS2_SEG,
      RS1_SEG,
      FUNCT3_SEG,
      RD_SEG,
      OPCODE_SEG,
    ],
    variants: [
      {
        when: { input: "opcode", oneOf: I_OPCODES },
        inputs: [
          seg("imm", "imm[11:0]", 12, COLOR.imm),
          RS1_SEG,
          FUNCT3_SEG,
          RD_SEG,
          OPCODE_SEG,
        ],
      },
      {
        when: { input: "opcode", equals: "0100011" },
        inputs: [
          seg("immHi", "imm[11:5]", FIELDS.immHi.width, COLOR.imm),
          RS2_SEG,
          RS1_SEG,
          FUNCT3_SEG,
          seg("immLo", "imm[4:0]", FIELDS.immLo.width, COLOR.imm),
          OPCODE_SEG,
        ],
      },
      {
        when: { input: "opcode", equals: "1100011" },
        inputs: [
          seg("immHi", "imm[12|10:5]", FIELDS.immHi.width, COLOR.imm),
          RS2_SEG,
          RS1_SEG,
          FUNCT3_SEG,
          seg("immLo", "imm[4:1|11]", FIELDS.immLo.width, COLOR.imm),
          OPCODE_SEG,
        ],
      },
      {
        when: { input: "opcode", oneOf: U_OPCODES },
        inputs: [
          seg("imm", "imm[31:12]", 20, COLOR.imm),
          RD_SEG,
          OPCODE_SEG,
        ],
      },
      {
        when: { input: "opcode", equals: "1101111" },
        inputs: [
          seg("imm", "imm[20|10:1|11|19:12]", 20, COLOR.imm),
          RD_SEG,
          OPCODE_SEG,
        ],
      },
    ],
  },
  {
    id: "riscv-decode",
    name: "Instruction Decoder",
    family: "RISC-V",
    description: "Read a word back into its fields. Letters stand for variables, so a pattern like 0000000rrrrrsssss000ddddd0110011 works as well as plain bits.",
    sendTo: "riscv-encode",
    sendLabel: "Edit in encoder →",
    // A word the decoder has fully read — no unknown-bit letters left in it —
    // can be handed straight to the encoder to tweak field by field.
    extractSendable: (res) => {
      const bits = res.fields?.find((f) => f.label === "Bits")?.value;
      return bits && /^[01]{32}$/.test(bits) ? wordFields(bits) : null;
    },
    inputs: [
      { id: "word", placeholder: "0000000 00111 00110 000 00101 0110011", format: "bits" },
      {
        id: "read",
        label: "Read as",
        kind: "choice",
        options: [
          { id: "bits", label: "Bits" },
          { id: "number", label: "Number" },
          { id: "hex", label: "Hex" },
        ],
        value: "bits",
      },
    ],
  },
];
