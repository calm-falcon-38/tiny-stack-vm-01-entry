// Tiny stack VM for make.fun's tiny stack ISA v1. Runs every program in the input directory and writes
// its output bytes and exit code, matching the kit's reference VM (generator/subject/vm.mjs) step for step:
// same order of checks, same traps, same wrapping 32-bit arithmetic.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Per opcode byte: [immediate bytes, pops, pushes]. A missing entry is an unknown opcode (trap 5).
const T = [];
for (const [b, m, p, q] of [
  [0,0,0,0],[1,1,0,1],[2,4,0,1],[3,0,1,0],[4,0,1,2],[5,0,2,2],[6,0,2,3],[7,0,3,3],
  [16,0,2,1],[17,0,2,1],[18,0,2,1],[19,0,2,1],[20,0,2,1],[21,0,2,1],[22,0,2,1],[23,0,1,1],
  [24,0,2,1],[25,0,2,1],[26,0,2,1],[27,0,1,1],[28,0,2,1],[29,0,2,1],[30,0,2,1],
  [32,0,2,1],[33,0,2,1],[34,0,2,1],[48,2,0,0],[49,2,1,0],[50,2,1,0],[51,2,0,0],[52,0,0,0],
  [64,0,1,1],[65,0,2,0],[80,0,1,0],[81,0,1,0],[82,0,0,1],[83,0,1,0],
]) T[b] = [m, p, q];

function run(P, N) {
  const n = P.length;
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const U = new Uint8Array(65536);
  let s = 0, c = 0, l = 0, i = 0, p = 0, t = 0;
  const end = (e) => ({ stdout: U.slice(0, l), exit: e });
  for (;;) {
    if (t === 1000000) return end(10); // step limit
    if (p < 0 || p >= n) return end(9); // pc outside the program
    const o = P[p];
    const d = T[o];
    if (!d) return end(5); // unknown opcode
    const [m, pops, pushes] = d;
    if (p + m >= n) return end(9); // immediate cut off by the program's end
    t++;
    const x = p + 1 + m;
    if (s < pops) return end(2); // stack underflow
    if (s - pops + pushes > 256) return end(3); // stack overflow
    p = x;
    switch (o) {
      case 0: return end(0); // HALT
      case 1: D[s++] = (P[x - 1] << 24) >> 24; break; // PUSH8, sign-extended
      case 2: D[s++] = P[x - 4] | P[x - 3] << 8 | P[x - 2] << 16 | P[x - 1] << 24; break; // PUSH32
      case 3: s--; break; // POP
      case 4: D[s] = D[s - 1]; s++; break; // DUP
      case 5: { const v = D[s - 1]; D[s - 1] = D[s - 2]; D[s - 2] = v; break; } // SWAP
      case 6: D[s] = D[s - 2]; s++; break; // OVER
      case 7: { const v = D[s - 3]; D[s - 3] = D[s - 2]; D[s - 2] = D[s - 1]; D[s - 1] = v; break; } // ROT
      case 23: D[s - 1] = -D[s - 1] | 0; break; // NEG
      case 27: D[s - 1] = ~D[s - 1]; break; // NOT
      case 48: case 49: case 50: { // JMP / JZ / JNZ: a signed offset from the next instruction
        const r = ((P[x - 2] | P[x - 1] << 8) << 16) >> 16;
        if (o === 48 || (o === 49 ? D[--s] === 0 : D[--s] !== 0)) p = x + r;
        break;
      }
      case 51: // CALL: the immediate is an unsigned absolute address
        if (c === 64) return end(7);
        C[c++] = x;
        p = P[x - 2] | P[x - 1] << 8;
        break;
      case 52: // RET
        if (c === 0) return end(8);
        p = C[--c];
        break;
      case 64: { // LOAD
        const a = D[s - 1];
        if (a < 0 || a > 255) return end(6);
        D[s - 1] = M[a];
        break;
      }
      case 65: { // STORE: ( v addr -- )
        const a = D[s - 1];
        if (a < 0 || a > 255) return end(6);
        M[a] = D[s - 2];
        s -= 2;
        break;
      }
      case 80: { // PRINT: decimal ASCII; past the output cap it traps and writes nothing
        const w = '' + D[s - 1];
        if (l + w.length > 65536) return end(11);
        s--;
        for (let k = 0; k < w.length; k++) U[l++] = w.charCodeAt(k);
        break;
      }
      case 81: // PUTC: one byte, the value's low 8 bits
        if (l === 65536) return end(11);
        U[l++] = D[--s] & 255;
        break;
      case 82: D[s++] = i < N.length ? N[i++] : -1; break; // IN: -1 once the input is used up
      case 83: return end(D[--s] & 255); // EXIT: the code is the value's low byte
      default: { // the two-operand arithmetic and comparison group: pop b (top), then a
        const b = D[s - 1], a = D[s - 2];
        let r;
        if (o === 16) r = a + b | 0;
        else if (o === 17) r = a - b | 0;
        else if (o === 18) r = Math.imul(a, b); // MUL: the low 32 bits of the exact product
        else if (o === 19) { if (!b) return end(4); r = a === -2147483648 && b === -1 ? a : a / b | 0; } // DIV
        else if (o === 20) { if (!b) return end(4); r = b === -1 ? 0 : a % b | 0; } // MOD: a's sign
        else if (o === 21) { if (!b) return end(4); r = Math.floor((a >>> 0) / (b >>> 0)) | 0; } // DIVU
        else if (o === 22) { if (!b) return end(4); r = (a >>> 0) % (b >>> 0) | 0; } // MODU
        else if (o === 24) r = a & b;
        else if (o === 25) r = a | b;
        else if (o === 26) r = a ^ b;
        else if (o === 28) r = a << (b & 31); // SHL
        else if (o === 29) r = a >> (b & 31); // SHR: arithmetic
        else if (o === 30) r = (a >>> (b & 31)) | 0; // SHRU: logical
        else if (o === 32) r = a === b ? 1 : 0; // EQ
        else if (o === 33) r = a < b ? 1 : 0; // LT: signed
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0; // LTU: unsigned
        s -= 2;
        D[s++] = r;
      }
    }
  }
}

for (const id of readdirSync(I).sort()) {
  const P = readFileSync(I + '/' + id + '/program.bin');
  let N;
  try { N = readFileSync(I + '/' + id + '/input.bin'); } catch { N = Buffer.alloc(0); }
  const r = run(P, N);
  mkdirSync(O + '/' + id, { recursive: true });
  writeFileSync(O + '/' + id + '/stdout.bin', r.stdout);
  writeFileSync(O + '/' + id + '/exit.txt', r.exit + '\n');
}
