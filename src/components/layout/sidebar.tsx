import { NavLink } from "react-router-dom";
import {
  BadgePoundSterling,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useSidebarStore } from "@/stores/sidebar-store";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  navigationGroups,
  secondaryNavigation,
} from "@/components/layout/navigation";

export function Sidebar() {
  const { collapsed, toggle } = useSidebarStore();

  return (
    <aside
      className={cn(
        "hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar-background text-sidebar-foreground transition-[width] duration-200 md:flex",
        collapsed ? "w-18" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-18 shrink-0 items-center border-b border-sidebar-border",
          collapsed ? "justify-center px-2" : "px-4",
        )}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <BadgePoundSterling className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="ml-3 min-w-0">
            <h1 className="truncate text-base font-bold text-white">
              SoleTrader
            </h1>
            <p className="truncate text-[11px] text-sidebar-foreground/55">
              Business finances
            </p>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 py-3">
        <TooltipProvider delayDuration={300}>
          <nav className="flex flex-col px-2.5" aria-label="Primary navigation">
            {navigationGroups.map((group, groupIndex) => (
              <div key={group.label} className={cn(groupIndex > 0 && "mt-4")}>
                {!collapsed && (
                  <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase text-sidebar-foreground/40">
                    {group.label}
                  </p>
                )}
                {collapsed && groupIndex > 0 && (
                  <Separator className="mx-2 my-2.5 bg-sidebar-border" />
                )}
                <div className="space-y-1">
                  {group.items.map((item) => (
                    <Tooltip key={item.to}>
                      <TooltipTrigger asChild>
                        <NavLink
                          to={item.to}
                          className={({ isActive }) =>
                            cn(
                              "group relative flex h-10 items-center rounded-md text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                              collapsed
                                ? "justify-center px-1"
                                : "gap-2.5 px-2",
                              isActive
                                ? "bg-sidebar-accent text-white before:absolute before:-left-2.5 before:h-5 before:w-0.5 before:rounded-r-lg before:bg-sidebar-primary"
                                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              <span
                                className={cn(
                                  "flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors",
                                  isActive
                                    ? "bg-sidebar-primary/15 text-sidebar-primary"
                                    : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground",
                                )}
                              >
                                <item.icon className="h-4.25 w-4.25" />
                              </span>
                              {!collapsed && (
                                <span className="truncate">{item.label}</span>
                              )}
                            </>
                          )}
                        </NavLink>
                      </TooltipTrigger>
                      {collapsed && (
                        <TooltipContent side="right">
                          {item.label}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}

            <div className="mt-5 border-t border-sidebar-border pt-4">
              {!collapsed && (
                <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase text-sidebar-foreground/40">
                  Tools
                </p>
              )}
              <div className="space-y-1">
                {secondaryNavigation.map((item) => (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) =>
                          cn(
                            "group relative flex h-9 items-center rounded-md text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                            collapsed ? "justify-center px-1" : "gap-2.5 px-2",
                            isActive
                              ? "bg-sidebar-accent text-white before:absolute before:-left-2.5 before:h-5 before:w-0.5 before:rounded-r-lg before:bg-sidebar-primary"
                              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                          )
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={cn(
                                "flex h-7 w-7 shrink-0 items-center justify-center rounded",
                                isActive
                                  ? "text-sidebar-primary"
                                  : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground",
                              )}
                            >
                              <item.icon className="h-4 w-4" />
                            </span>
                            {!collapsed && (
                              <span className="truncate">{item.label}</span>
                            )}
                          </>
                        )}
                      </NavLink>
                    </TooltipTrigger>
                    {collapsed && (
                      <TooltipContent side="right">{item.label}</TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </div>
            </div>
          </nav>
        </TooltipProvider>
      </ScrollArea>

      <div className="shrink-0 border-t border-sidebar-border p-2.5">
        <Button
          variant="ghost"
          onClick={toggle}
          className={cn(
            "h-9 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed ? "w-full px-0" : "w-full justify-start px-2.5",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span>Collapse sidebar</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
