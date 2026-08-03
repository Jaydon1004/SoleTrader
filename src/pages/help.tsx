import { useDeferredValue, useState } from "react";
import { BookOpenText, Search } from "lucide-react";
import { PageHeader } from "@/components/page-shell";
import { Input } from "@/components/ui/input";
import { filterHelpTopics } from "@/lib/help-topics";

export function HelpPage() {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const topics = filterHelpTopics(deferredQuery);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Support"
        title="Help"
        description="Find supported workflows, important limitations, and steps for protecting or recovering your records."
      />

      <div className="relative max-w-2xl">
        <label htmlFor="help-search" className="sr-only">
          Search help
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search backups, VAT, imports, recovery..."
          className="pl-9"
        />
      </div>

      <p className="text-sm text-muted-foreground" role="status">
        {topics.length === 1 ? "1 help topic" : `${topics.length} help topics`}
      </p>

      {topics.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {topics.map((topic) => (
            <article
              key={topic.id}
              id={topic.id}
              className="rounded-md border bg-card p-5"
            >
              <h2 className="text-lg font-semibold">{topic.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {topic.summary}
              </p>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
                {topic.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed py-12 text-center">
          <BookOpenText
            className="mx-auto h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="mt-3 font-semibold">No help topics found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a broader word such as backup, VAT, bank or recovery.
          </p>
        </div>
      )}
    </div>
  );
}
