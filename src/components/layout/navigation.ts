import {
  Bell,
  CircleHelp,
  BriefcaseBusiness,
  Calculator,
  Car,
  FileText,
  BadgePoundSterling,
  FolderOpen,
  History,
  Landmark,
  LayoutDashboard,
  PieChart,
  Receipt,
  Settings,
  Users,
  WalletCards,
} from "lucide-react";

export const navigationGroups = [
  {
    label: "Overview",
    items: [{ to: "/", icon: LayoutDashboard, label: "Dashboard" }],
  },
  {
    label: "Sales",
    items: [
      { to: "/invoices", icon: FileText, label: "Invoices" },
      { to: "/income", icon: BadgePoundSterling, label: "Direct income" },
      { to: "/clients", icon: Users, label: "Clients" },
    ],
  },
  {
    label: "Spending & banking",
    items: [
      { to: "/expenses", icon: Receipt, label: "Expenses" },
      { to: "/vehicles", icon: Car, label: "Mileage" },
      { to: "/bank", icon: WalletCards, label: "Bank transactions" },
    ],
  },
  {
    label: "Accounting",
    items: [
      { to: "/vat", icon: Landmark, label: "VAT" },
      { to: "/tax", icon: Calculator, label: "Self Assessment" },
      { to: "/reports", icon: PieChart, label: "Reports" },
      { to: "/accountant", icon: BriefcaseBusiness, label: "Accountant" },
    ],
  },
];

export const secondaryNavigation = [
  { to: "/documents", icon: FolderOpen, label: "Documents" },
  { to: "/reminders", icon: Bell, label: "Reminders" },
  { to: "/activity", icon: History, label: "Activity & Recovery" },
  { to: "/help", icon: CircleHelp, label: "Help" },
  { to: "/settings", icon: Settings, label: "Settings" },
];
