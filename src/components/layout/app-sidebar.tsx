import Link from "next/link";
import { AppNav } from "@/components/layout/app-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh flex-col border-r bg-card lg:flex">
      <div className="flex h-16 items-center border-b px-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 font-semibold tracking-tight"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground">
            HF
          </span>
          <span>
            <span className="block leading-tight">HoraFlow</span>
            <span className="block text-xs font-normal text-muted-foreground">
              Controle de horas
            </span>
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <AppNav />
      </div>

      <div className="border-t px-3 py-3">
        <div className="flex items-center justify-between gap-2 rounded-md px-2 py-1">
          <div className="text-xs text-muted-foreground">
            <p className="font-medium text-foreground">MVP local</p>
            <p>BRL · America/Sao_Paulo</p>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
