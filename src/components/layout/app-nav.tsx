"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { navigationItems } from "@/components/layout/navigation";

type AppNavProps = {
  onNavigate?: () => void;
  className?: string;
};

export function AppNav({ onNavigate, className }: AppNavProps) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navegação principal" className={className}>
      <ul className="flex flex-col gap-1">
        {navigationItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  active &&
                    "bg-accent text-accent-foreground shadow-sm ring-1 ring-border",
                )}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
