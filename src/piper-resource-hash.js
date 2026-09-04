import { sha256 } from "@noble/hashes/sha2.js";

export function bytesToLowercaseHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function createPiperResourceSha256() {
  const hasher = sha256.create();
  return {
    update(bytes) {
      hasher.update(bytes);
      return this;
    },
    digestHex() {
      return bytesToLowercaseHex(hasher.digest());
    },
  };
}
