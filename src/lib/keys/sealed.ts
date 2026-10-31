import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  generateKeyPairSync,
  hkdfSync,
  randomBytes,
  type KeyObject,
} from "node:crypto";

// Sealed boxes for users' Delta API keys. The website seals with the sync
// server's public key and cannot open what it sealed; only the server, which
// holds the private key, can. Each box is bound to a context string (the
// owner's user id), so a box copied to another user's row will not open.
//
// Format: "v1." + base64(ephemeral X25519 public key (32) | IV (12) | GCM tag (16) | ciphertext)

const VERSION = "v1.";
const INFO = Buffer.from("edgebook delta key v1");

/** A new key pair as base64 DER (SPKI public, PKCS#8 private), for .env files. */
export function generateSealKeys(): { publicKey: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync("x25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

export function seal(publicKeyB64: string, plaintext: string, context: string): string {
  const recipient = createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" });
  const ephemeral = generateKeyPairSync("x25519");
  const ephemeralRaw = rawPublic(ephemeral.publicKey);
  const key = deriveKey(diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient }), ephemeralRaw, rawPublic(recipient));

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return VERSION + Buffer.concat([ephemeralRaw, iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

/** Throws if the box is malformed, was sealed for another key or context, or was tampered with. */
export function open(privateKeyB64: string, box: string, context: string): string {
  if (!box.startsWith(VERSION)) throw new Error("Unknown sealed key format");
  const bytes = Buffer.from(box.slice(VERSION.length), "base64");
  if (bytes.length < 32 + 12 + 16 + 1) throw new Error("Sealed key is truncated");
  const ephemeralRaw = bytes.subarray(0, 32);
  const iv = bytes.subarray(32, 44);
  const tag = bytes.subarray(44, 60);
  const ciphertext = bytes.subarray(60);

  const privateKey = createPrivateKey({ key: Buffer.from(privateKeyB64, "base64"), format: "der", type: "pkcs8" });
  const ephemeral = createPublicKey({ key: { kty: "OKP", crv: "X25519", x: ephemeralRaw.toString("base64url") }, format: "jwk" });
  const key = deriveKey(diffieHellman({ privateKey, publicKey: ephemeral }), ephemeralRaw, rawPublic(createPublicKey(privateKey)));

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function rawPublic(key: KeyObject): Buffer {
  return Buffer.from(key.export({ format: "jwk" }).x!, "base64url");
}

function deriveKey(shared: Buffer, ephemeralRaw: Buffer, recipientRaw: Buffer): Buffer {
  return Buffer.from(hkdfSync("sha256", shared, Buffer.concat([ephemeralRaw, recipientRaw]), INFO, 32));
}
