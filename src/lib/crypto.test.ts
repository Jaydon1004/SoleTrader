import { describe, expect, it } from "vitest";
import { hashPin, pinHashNeedsUpgrade, verifyPin } from "@/lib/crypto";

describe("PIN hashing", () => {
  it("creates salted hashes and verifies only the correct PIN", async () => {
    const first = await hashPin("1234");
    const second = await hashPin("1234");

    expect(first).not.toBe(second);
    expect(pinHashNeedsUpgrade(first)).toBe(false);
    await expect(verifyPin("1234", first)).resolves.toBe(true);
    await expect(verifyPin("9999", first)).resolves.toBe(false);
  });

  it("verifies legacy hashes so they can be upgraded after unlock", async () => {
    const bytes = new TextEncoder().encode("soletrader-pin:1234");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    const legacy = Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    expect(pinHashNeedsUpgrade(legacy)).toBe(true);
    await expect(verifyPin("1234", legacy)).resolves.toBe(true);
  });
});
