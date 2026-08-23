// The one number box: type a value in any base and read it back in all of
// them. There is nothing to pick on the way out — every representation is
// shown at once — so the only choice is how the input should be read, and even
// that guesses well on its own.

import { cleanBits, parseDigits } from "./bits.js";

const BASES = {
  bin: { radix: 2, name: "binary", prefix: "0b" },
  dec: { radix: 10, name: "decimal", prefix: "" },
  hex: { radix: 16, name: "hex", prefix: "0x" },
  oct: { radix: 8, name: "octal", prefix: "0o" },
};

// bitLen counts the bits of the magnitude, like big.Int.BitLen.
const bitLen = (v) => {
  const a = v < 0n ? -v : v;
  return a === 0n ? 0 : a.toString(2).length;
};

// describeWidth spells a bit count out in bytes, e.g. "12 bits (1 byte + 4 bits)".
function describeWidth(width) {
  const bytes = Math.floor(width / 8);
  const rest = width % 8;
  const unit = bytes === 1 ? "byte" : "bytes";
  if (bytes === 0) return `${width} bits`;
  if (rest === 0) return `${width} bits (${bytes} ${unit})`;
  return `${width} bits (${bytes} ${unit} + ${rest} bits)`;
}

// readAs decides which base the digits are in and hands back the digits with
// any prefix removed.
function readAs(choice, text) {
  const chosen = BASES[choice];
  if (chosen) {
    const lower = text.toLowerCase();
    const digits = chosen.prefix && lower.startsWith(chosen.prefix)
      ? lower.slice(chosen.prefix.length)
      : lower;
    return [chosen, digits];
  }

  // Auto: a prefix settles it, then a string of nothing but 0 and 1 is far
  // more likely to be bits than a decimal number in this toolbox.
  const lower = text.toLowerCase();
  for (const id of ["hex", "bin", "oct"]) {
    const base = BASES[id];
    if (lower.startsWith(base.prefix)) return [base, lower.slice(base.prefix.length)];
  }
  if (/^[01]*$/.test(text)) return [BASES.bin, text];
  return [BASES.dec, text];
}

// byteWidth is the narrowest whole number of bytes the value fits in.
function byteWidth(value, negative) {
  // Two's complement reaches one further down than up.
  const need = negative ? bitLen(value - 1n) + 1 : bitLen(value);
  for (let width = 8; width < 1 << 16; width += 8) {
    if (need <= width) return width;
  }
  return need;
}

// signedReading is the two's complement meaning of the pattern, or null when
// that does not differ from the plain reading.
function signedReading(pattern, width, negative) {
  if (negative || ((pattern >> BigInt(width - 1)) & 1n) === 0n) return null;
  return (pattern - (1n << BigInt(width))).toString();
}

// bitsOf writes the low width bits of the pattern, most significant first.
function bitsOf(pattern, width) {
  return pattern.toString(2).padStart(width, "0").slice(-width);
}

export function convertNumber(input) {
  const text = cleanBits(input.value || "");
  if (text === "") return [];

  const negative = text.startsWith("-");
  const [base, digits] = readAs(input.base, negative ? text.slice(1) : text);
  if (digits === "") return []; // a lone prefix: the value is still being typed

  const value = parseDigits(digits, base.radix);
  if (value === null) throw new Error(`${JSON.stringify(text)} is not a ${base.name} number`);

  // Binary input is taken at the width it was typed; anything else gets the
  // narrowest whole number of bytes that holds it.
  const width = base.radix === 2 ? digits.length : byteWidth(value, negative);

  // pattern is what the bits actually hold, so a negative shows up as its
  // two's complement.
  const pattern = negative ? (1n << BigInt(width)) - value : value;

  const fields = [
    { label: "Read as", value: `${base.name}, ${describeWidth(width)}` },
    { label: "Decimal", value: (negative ? "-" : "") + value.toString() },
  ];
  const signed = signedReading(pattern, width, negative);
  if (signed !== null) {
    fields.push({ label: `Signed (${width}-bit two's complement)`, value: signed });
  }
  fields.push(
    { label: "Hex", value: "0x" + pattern.toString(16).toUpperCase().padStart(Math.floor((width + 3) / 4), "0") },
    { label: "Octal", value: "0o" + pattern.toString(8) },
    { label: "Binary", value: bitsOf(pattern, width), format: "bits" },
  );
  if (width < 32) {
    fields.push({ label: "32 bits", value: bitsOf(pattern, 32), format: "bits" });
  }
  return fields;
}
