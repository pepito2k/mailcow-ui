import { createInterface } from "node:readline/promises";
import { hashPassword } from "./auth.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });
const pw = await rl.question("New admin password: ");
rl.close();
if (pw.length < 8) {
  console.error("Use at least 8 characters.");
  process.exit(1);
}
console.log(`\nADMIN_PASSWORD_HASH='${hashPassword(pw)}'`);
