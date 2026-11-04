import {
  BarChart3,
  CalendarDays,
  FolderKanban,
  LayoutDashboard,
  Receipt,
  Settings,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const navigationItems: NavigationItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/timesheet", label: "Horas", icon: CalendarDays },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/projects", label: "Projetos", icon: FolderKanban },
  { href: "/billing", label: "Faturamento", icon: Receipt },
  { href: "/reports", label: "Relatórios", icon: BarChart3 },
  { href: "/import", label: "Importar", icon: Upload },
  { href: "/settings", label: "Configurações", icon: Settings },
];
