import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { ReminderNotifier } from "@/components/reminder-notifier";
import { AutomaticUpdateChecker } from "@/components/automatic-update-checker";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/clients": "Clients",
  "/invoices": "Invoices",
  "/expenses": "Expenses",
  "/vehicles": "Vehicles & Mileage",
  "/vat": "VAT",
  "/tax": "Tax Calculator",
  "/reports": "Reports",
  "/accountant": "Accountant",
  "/documents": "Documents",
  "/bank": "Bank Reconciliation",
  "/reminders": "Reminders",
  "/activity": "Activity & Recovery",
  "/help": "Help",
  "/settings": "Settings",
};

export function AppLayout() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "SoleTrader";

  return (
    <div className="flex h-screen overflow-hidden">
      <a
        href="#main-content"
        className="sr-only z-100 bg-background p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      <ReminderNotifier />
      <AutomaticUpdateChecker />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} />
        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-auto p-4 lg:p-6"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
