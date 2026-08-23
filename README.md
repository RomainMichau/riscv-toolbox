# RISC-V Toolbox

Browser helpers for RV32: a number converter, and the instruction set as
reference, encoder and decoder. The reference is the
[RISC-V card](https://www.cs.sfu.ca/~ashriram/Courses/CS295/assets/notebooks/RISCV/RISCV_CARD.pdf)
— RV32I, plus the M and A extensions, plus the C, F and D tables it lists
without encodings.

**→ [romainmichau.github.io/riscv-toolbox](https://romainmichau.github.io/riscv-toolbox/)**

The opcode is the field everything hangs off: type it into the encoder and the
row of boxes changes into the format it asks for.

Static site — no backend, no build. It is `docs/`, served as it sits.

```sh
npm run serve   # localhost:8080
npm test
```
