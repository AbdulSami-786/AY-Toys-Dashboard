// Prints a new random owner key (40 letters and digits) for OWNER_KEY in src/config.js.
import { randomBytes } from 'node:crypto';

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const b = randomBytes(40);
let s = '';
for (let i = 0; i < 40; i++) s += A[b[i] % A.length];
console.log(s);
