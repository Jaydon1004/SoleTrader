import {
  createBrowserRouter,
  isRouteErrorResponse,
  Link,
  useRouteError,
} from "react-router-dom";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";

function RouteError({ notFound = false }: { notFound?: boolean }) {
  const error = useRouteError();
  const missing =
    notFound || (isRouteErrorResponse(error) && error.status === 404);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="max-w-md space-y-4 text-center">
        <h1 className="text-xl font-semibold">
          {missing ? "Page not found" : "This page could not be opened"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {missing
            ? "The requested page does not exist."
            : "Your bookkeeping data has not been changed. Try opening the page again."}
        </p>
        <Button asChild>
          <Link to="/">Return to dashboard</Link>
        </Button>
      </section>
    </main>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    errorElement: <RouteError />,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("@/pages/dashboard")).DashboardPage,
        }),
      },
      {
        path: "clients",
        lazy: async () => ({
          Component: (await import("@/pages/clients")).ClientsPage,
        }),
      },
      {
        path: "invoices",
        lazy: async () => ({
          Component: (await import("@/pages/invoices")).InvoicesPage,
        }),
      },
      {
        path: "income",
        lazy: async () => ({
          Component: (await import("@/pages/income")).IncomePage,
        }),
      },
      {
        path: "expenses",
        lazy: async () => ({
          Component: (await import("@/pages/expenses")).ExpensesPage,
        }),
      },
      {
        path: "vehicles",
        lazy: async () => ({
          Component: (await import("@/pages/vehicles")).VehiclesPage,
        }),
      },
      {
        path: "vat",
        lazy: async () => ({
          Component: (await import("@/pages/vat")).VatPage,
        }),
      },
      {
        path: "tax",
        lazy: async () => ({
          Component: (await import("@/pages/tax")).TaxPage,
        }),
      },
      {
        path: "tax-relief-guide",
        lazy: async () => ({
          Component: (await import("@/pages/tax-relief-guide"))
            .TaxReliefGuidePage,
        }),
      },
      {
        path: "reports",
        lazy: async () => ({
          Component: (await import("@/pages/reports")).ReportsPage,
        }),
      },
      {
        path: "accountant",
        lazy: async () => ({
          Component: (await import("@/pages/accountant")).AccountantPage,
        }),
      },
      {
        path: "hmrc-handoff",
        lazy: async () => ({
          Component: (await import("@/pages/hmrc-handoff")).HmrcHandoffPage,
        }),
      },
      {
        path: "documents",
        lazy: async () => ({
          Component: (await import("@/pages/documents")).DocumentsPage,
        }),
      },
      {
        path: "bank",
        lazy: async () => ({
          Component: (await import("@/pages/bank")).BankPage,
        }),
      },
      {
        path: "reminders",
        lazy: async () => ({
          Component: (await import("@/pages/reminders")).RemindersPage,
        }),
      },
      {
        path: "activity",
        lazy: async () => ({
          Component: (await import("@/pages/activity")).ActivityPage,
        }),
      },
      {
        path: "help",
        lazy: async () => ({
          Component: (await import("@/pages/help")).HelpPage,
        }),
      },
      {
        path: "settings",
        lazy: async () => ({
          Component: (await import("@/pages/settings")).SettingsPage,
        }),
      },
      { path: "*", element: <RouteError notFound /> },
    ],
  },
]);
