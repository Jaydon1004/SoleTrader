// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HelpPage } from "@/pages/help";

async function audit(markup: string) {
  document.body.innerHTML = markup;
  return axe.run(document.body, {
    rules: {
      "color-contrast": { enabled: false },
    },
  });
}

describe("accessibility foundations", () => {
  it("uses the icon button name as its accessible name and tooltip", async () => {
    const results = await audit(
      renderToStaticMarkup(
        <Button size="icon" aria-label="Search records">
          <Search />
        </Button>,
      ),
    );
    const button = document.querySelector("button");

    expect(button?.getAttribute("aria-label")).toBe("Search records");
    expect(button?.getAttribute("title")).toBe("Search records");
    expect(results.violations).toEqual([]);
  });

  it("gives searchable help labelled controls and structured content", async () => {
    const results = await audit(
      renderToStaticMarkup(
        <main>
          <HelpPage />
        </main>,
      ),
    );

    expect(document.querySelector("h1")?.textContent).toBe("Help");
    expect(document.querySelector("label[for='help-search']")).not.toBeNull();
    expect(document.querySelector("[role='status']")).not.toBeNull();
    expect(results.violations).toEqual([]);
  });
});
