import { describe, expect, it } from "vitest";
import {
  compareTradingAllowance,
  filterTaxReliefItems,
  sourcesForTaxReliefItem,
  taxReliefItems,
} from "@/lib/tax-relief-guide";
import {
  evaluateTaxReliefQuestionnaire,
  questionnaireCoverage,
} from "@/lib/tax-relief-questionnaire";

describe("tax relief guide", () => {
  it.each([
    ["office-software", "expense"],
    ["equipment-assets", "capital"],
    ["pension-gift-aid", "tax-relief"],
    ["work-clothing", "restricted"],
    ["entertaining", "not-allowable"],
    ["personal-costs", "not-allowable"],
  ] as const)("classifies %s as %s", (id, treatment) => {
    expect(taxReliefItems.find((item) => item.id === id)?.treatment).toBe(
      treatment,
    );
  });

  it("finds claims using plain-language synonyms", () => {
    expect(filterTaxReliefItems("broadband").map((item) => item.id)).toEqual([
      "phone-internet",
    ]);
    expect(
      filterTaxReliefItems("customer meal").map((item) => item.id),
    ).toEqual(["entertaining"]);
  });

  it("filters by treatment and relevant circumstances", () => {
    const ids = filterTaxReliefItems("", "restricted", ["vehicle"]).map(
      (item) => item.id,
    );
    expect(ids).toEqual(
      expect.arrayContaining(["vehicle-mileage", "vehicle-actual"]),
    );
    expect(ids).not.toContain("working-home");
  });

  it("compares the trading allowance without stacking it with expenses", () => {
    expect(compareTradingAllowance(8000, 450)).toMatchObject({
      tradingAllowance: 1000,
      preferred: "allowance",
      deductionDifference: 550,
    });
    expect(compareTradingAllowance(8000, 2400)).toMatchObject({
      tradingAllowance: 1000,
      preferred: "expenses",
      deductionDifference: 1400,
    });
    expect(compareTradingAllowance(600, 0).tradingAllowance).toBe(600);
  });

  it("provides an official source and unique id for every topic", () => {
    expect(
      taxReliefItems.every((item) => sourcesForTaxReliefItem(item).length > 0),
    ).toBe(true);
    expect(new Set(taxReliefItems.map((item) => item.id)).size).toBe(
      taxReliefItems.length,
    );
  });

  it("covers every guide topic in the questionnaire", () => {
    expect(questionnaireCoverage()).toEqual([]);
  });

  it("turns answers into possible claims, review items and exclusions", () => {
    const results = evaluateTaxReliefQuestionnaire({
      "phone-internet": "yes",
      "domestic-appliances": "unsure",
      "client-entertaining": "yes",
      training: "no",
    });

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          item: expect.objectContaining({ id: "phone-internet" }),
          status: "possible-claim",
        }),
        expect.objectContaining({
          item: expect.objectContaining({ id: "equipment-assets" }),
          status: "check-details",
        }),
        expect.objectContaining({
          item: expect.objectContaining({ id: "entertaining" }),
          status: "exclude",
        }),
      ]),
    );
    expect(results.some((result) => result.item.id === "training")).toBe(false);
  });
});
