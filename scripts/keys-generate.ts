// Creates the key pair that locks users' Delta keys, and writes it into
// .env.local without printing it:
//   npm run keys:generate
// DELTA_KEYS_PUBLIC_KEY goes to Vercel (it can only lock). DELTA_KEYS_PRIVATE_KEY
// goes only to the sync server (it unlocks); never put it on Vercel. Losing the
// private key means every user has to connect their Delta key again.

import { appendFileSync, readFileSync } from "node:fs";
import { generateSealKeys } from "@/lib/keys/sealed";

const file = ".env.local";
const env = readFileSync(file, "utf8");
if (/^DELTA_KEYS_(PUBLIC|PRIVATE)_KEY=/m.test(env)) {
  console.error("DELTA_KEYS_PUBLIC_KEY or DELTA_KEYS_PRIVATE_KEY is already in .env.local; not replacing it (that would lock out every stored key).");
  process.exit(1);
}
const { publicKey, privateKey } = generateSealKeys();
appendFileSync(file, `${env.endsWith("\n") ? "" : "\n"}DELTA_KEYS_PUBLIC_KEY=${publicKey}\nDELTA_KEYS_PRIVATE_KEY=${privateKey}\n`);
console.log("Added DELTA_KEYS_PUBLIC_KEY and DELTA_KEYS_PRIVATE_KEY to .env.local.");
