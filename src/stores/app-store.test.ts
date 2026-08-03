import { describe, expect, it } from "vitest";
import { currentUkTaxYear } from "@/stores/app-store";

describe("current UK tax year", () => {
  it("changes on 6 April", () => {
    expect(currentUkTaxYear(new Date(2026, 3, 5))).toBe("2025/26");
    expect(currentUkTaxYear(new Date(2026, 3, 6))).toBe("2026/27");
    expect(currentUkTaxYear(new Date(2026, 7, 2))).toBe("2026/27");
  });
});
