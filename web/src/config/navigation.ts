import {
  AlertTriangle,
  Bot,
  CalendarDays,
  Gauge,
  Import,
  LayoutDashboard,
  Rows3,
  Users,
  Waypoints,
} from "lucide-react";

export const navigation = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sites", label: "Sites", icon: Waypoints },
  { href: "/ai-reports", label: "AI Reports", icon: Bot },
  { href: "/tracker", label: "Tracker", icon: Rows3 },
  { href: "/capacity", label: "Capacity", icon: Gauge },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/imports", label: "Imports", icon: Import },
  { href: "/team", label: "Team", icon: Users },
  { href: "/triage", label: "Triage", icon: AlertTriangle },
];
