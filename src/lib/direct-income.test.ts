import { describe, expect, it } from "vitest";
import { calculateCisSettlement } from "@/lib/queries/direct-income";

describe("CIS direct-income settlement", () => {
  it("calculates gross and deducted CIS from cash received", () => {
    expect(calculateCisSettlement(180, 20, "after_cis")).toEqual({
      cash: 180,
      gross: 225,
      deduction: 45,
    });
  });

  it("calculates cash received from gross income", () => {
    expect(calculateCisSettlement(225, 20, "gross")).toEqual({
      cash: 180,
      gross: 225,
      deduction: 45,
    });
  });

  it("rejects unsupported CIS rates", () => {
    expect(calculateCisSettlement(180, 10, "after_cis")).toEqual({
      cash: 0,
      gross: 0,
      deduction: 0,
    });
  });
});
