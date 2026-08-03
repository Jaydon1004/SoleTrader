import { useEffect, useState } from "react";
import {
  Bell,
  Building2,
  Car,
  FileText,
  FolderUp,
  LockKeyhole,
  Menu,
  Plus,
  Receipt,
  Search,
  Users,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { GlobalSearchDialog } from "@/components/global-search-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { useReminderCentre } from "@/lib/queries/reminders";
import { useAppSetting } from "@/lib/queries/settings";
import { useAppStore } from "@/stores/app-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  navigationGroups,
  secondaryNavigation,
} from "@/components/layout/navigation";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const taxYear = useAppStore((state) => state.currentTaxYear);
  const { data: pinEnabled } = useAppSetting("pin_enabled");
  const { data } = useReminderCentre(taxYear);
  const count = data?.alerts.length ?? 0;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      } else if (
        event.ctrlKey &&
        event.altKey &&
        event.key.toLowerCase() === "i"
      ) {
        event.preventDefault();
        navigate("/invoices");
      } else if (
        event.ctrlKey &&
        event.altKey &&
        event.key.toLowerCase() === "e"
      ) {
        event.preventDefault();
        navigate("/expenses");
      } else if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        navigate("/settings");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-2 sm:px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[calc(100vh-4rem)] w-64 overflow-y-auto md:hidden"
          >
            {navigationGroups.map((group, index) => (
              <div key={group.label}>
                {index > 0 && <DropdownMenuSeparator />}
                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                {group.items.map((item) => (
                  <DropdownMenuItem asChild key={item.to}>
                    <Link to={item.to}>
                      <item.icon />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </div>
            ))}
            <DropdownMenuSeparator />
            {secondaryNavigation.map((item) => (
              <DropdownMenuItem asChild key={item.to}>
                <Link to={item.to}>
                  <item.icon />
                  {item.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Tax year {taxYear}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Create</DropdownMenuLabel>
            <DropdownMenuItem
              onSelect={() => navigate("/invoices?new=invoice")}
            >
              <FileText />
              Invoice
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => navigate("/expenses?new=expense")}
            >
              <Receipt />
              Expense
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/clients?new=client")}>
              <Users />
              Client
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => navigate("/vehicles?new=mileage")}
            >
              <Car />
              Mileage journey
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => navigate("/documents?new=document")}
            >
              <FolderUp />
              Document
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => navigate("/reminders?new=reminder")}
            >
              <Bell />
              Reminder
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          className="hidden h-9 min-w-52 justify-between text-muted-foreground lg:flex"
          onClick={() => setSearchOpen(true)}
        >
          <span className="flex items-center">
            <Search className="mr-2 h-4 w-4" />
            Search
          </span>
          <kbd className="rounded border bg-muted px-1.5 text-[10px]">
            Ctrl K
          </kbd>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Search"
          onClick={() => setSearchOpen(true)}
        >
          <Search className="h-4 w-4" />
        </Button>
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="relative"
          title="Open reminders"
          aria-label="Open reminders"
        >
          <Link to="/reminders">
            <Bell className="h-4 w-4" />
            {count > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Switch business"
          aria-label="Open Accounts"
          onClick={() =>
            window.dispatchEvent(new Event("soletrader:close-workspace"))
          }
        >
          <Building2 className="h-4 w-4" />
        </Button>
        {pinEnabled === "true" && (
          <Button
            variant="ghost"
            size="icon"
            title="Lock now"
            aria-label="Lock SoleTrader"
            onClick={() => window.dispatchEvent(new Event("soletrader:lock"))}
          >
            <LockKeyhole className="h-4 w-4" />
          </Button>
        )}
        <ThemeToggle />
      </div>
      <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
