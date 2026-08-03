import type { LucideIcon } from "lucide-react";
import { RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PageHeader({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryActions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {(primaryAction || secondaryActions) && (
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {secondaryActions}
          {primaryAction}
        </div>
      )}
    </header>
  );
}

export interface SavedView<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function SavedViews<T extends string>({
  value,
  views,
  onChange,
  label = "Saved views",
}: {
  value: T;
  views: SavedView<T>[];
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b" aria-label={label}>
      {views.map((view) => (
        <button
          key={view.value}
          type="button"
          onClick={() => onChange(view.value)}
          aria-current={value === view.value ? "page" : undefined}
          className={`flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${value === view.value ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {view.label}
          {view.count !== undefined && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums">
              {view.count}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

export function FilterToolbar({
  search,
  onSearchChange,
  placeholder,
  children,
  activeCount = 0,
  onClear,
  trailing,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  trailing?: ReactNode;
}) {
  return (
    <section className="rounded-md border bg-card p-3" aria-label="Filters">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={placeholder}
          />
        </div>
        {children}
        {activeCount > 0 && onClear && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X className="mr-2 h-4 w-4" />
            Clear {activeCount}
          </Button>
        )}
        {trailing}
      </div>
      {activeCount > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          {activeCount} filter{activeCount === 1 ? "" : "s"} active
        </p>
      )}
    </section>
  );
}

export function SummaryTile({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  tone?: "default" | "positive" | "attention" | "danger";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "attention"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="rounded-md border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center border border-dashed bg-card px-6 py-12 text-center">
      <span className="rounded-md bg-muted p-3">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </span>
      <h2 className="mt-4 text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function PageSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-5" role="status" aria-label="Loading content">
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 max-w-xl animate-pulse rounded bg-muted" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-md border bg-muted/60"
          />
        ))}
      </div>
      <div className="h-12 animate-pulse rounded-md border bg-muted/60" />
      <div className="overflow-hidden rounded-md border bg-card">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex gap-4 border-b p-4 last:border-0">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
            <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function QueryErrorState({
  title = "Records could not be loaded",
  onRetry,
  isRetrying = false,
}: {
  title?: string;
  onRetry: () => void | Promise<unknown>;
  isRetrying?: boolean;
}) {
  return (
    <Alert variant="destructive" className="mx-auto max-w-2xl">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="mt-2 space-y-4">
        <p>
          Your bookkeeping data has not been changed. Check the business
          workspace and try again.
        </p>
        <Button
          variant="outline"
          onClick={() => void onRetry()}
          disabled={isRetrying}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isRetrying ? "animate-spin" : ""}`}
          />
          {isRetrying ? "Retrying..." : "Try again"}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
