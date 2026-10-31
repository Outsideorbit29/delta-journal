import { describe, expect, it } from "vitest";
import { generateSealKeys, open, seal } from "./sealed";

describe("sealed boxes", () => {
  const keys = generateSealKeys();

  it("opens with the private key and the same context", () => {
    const box = seal(keys.publicKey, '{"k":"key","s":"secret"}', "user_a");
    expect(box.startsWith("v1.")).toBe(true);
    expect(box).not.toContain("secret");
    expect(open(keys.privateKey, box, "user_a")).toBe('{"k":"key","s":"secret"}');
  });

  it("seals the same text differently every time", () => {
    expect(seal(keys.publicKey, "x", "u")).not.toBe(seal(keys.publicKey, "x", "u"));
  });

  it("refuses another user's context, another private key, and any tampering", () => {
    const box = seal(keys.publicKey, "secret", "user_a");
    expect(() => open(keys.privateKey, box, "user_b")).toThrow();
    expect(() => open(generateSealKeys().privateKey, box, "user_a")).toThrow();

    const bytes = Buffer.from(box.slice(3), "base64");
    bytes[bytes.length - 1] ^= 1;
    expect(() => open(keys.privateKey, "v1." + bytes.toString("base64"), "user_a")).toThrow();
    expect(() => open(keys.privateKey, "v2." + box.slice(3), "user_a")).toThrow("Unknown sealed key format");
    expect(() => open(keys.privateKey, "v1.AAAA", "user_a")).toThrow("truncated");
  });
});
