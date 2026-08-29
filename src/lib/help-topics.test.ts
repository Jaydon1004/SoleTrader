import { describe, expect, it } from "vitest";
import { filterHelpTopics, helpTopics } from "@/lib/help-topics";

describe("filterHelpTopics", () => {
  it("returns all topics for an empty search", () => {
    expect(filterHelpTopics(" ")).toEqual(helpTopics);
  });

  it("matches keywords and requires every search term", () => {
    expect(filterHelpTopics("HMRC estimate").map((topic) => topic.id)).toEqual([
      "tax-vat-limitations",
    ]);
    expect(
      filterHelpTopics("backup external").map((topic) => topic.id),
    ).toEqual(["backup-restore"]);
  });

  it("returns no topics when no content matches", () => {
    expect(filterHelpTopics("unsupported-search-term")).toEqual([]);
  });

  it("explains the local bank connection boundary", () => {
    expect(filterHelpTopics("open banking").map((topic) => topic.id)).toEqual([
      "bank-connections",
    ]);
  });
});
