// Shared helpers for reading the bits a human types.

// cleanBits strips the separators a human naturally types inside a number.
export function cleanBits(input) {
  return input.replace(/[\s_|]/g, "");
}

const DIGITS = "0123456789abcdefghijklmnopqrstuvwxyz";

// parseDigits reads a run of digits in the given radix as a BigInt, or returns
// null when the run holds anything that radix has no digit for.
export function parseDigits(digits, radix) {
  if (digits === "") return null;
  let value = 0n;
  const r = BigInt(radix);
  for (const ch of digits.toLowerCase()) {
    const d = DIGITS.indexOf(ch);
    if (d < 0 || d >= radix) return null;
    value = value * r + BigInt(d);
  }
  return value;
}
