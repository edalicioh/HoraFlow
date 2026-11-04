"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useRef, type KeyboardEvent } from "react";
import { AppNav } from "@/components/layout/app-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function MobileHeader() {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);

  function closeMenu() {
    if (detailsRef.current) {
      detailsRef.current.open = false;
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDetailsElement>) {
    if (event.key === "Escape" && detailsRef.current?.open) {
      event.preventDefault();
      closeMenu();
      summaryRef.current?.focus();
    }
  }

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur lg:hidden">
      <div className="flex h-14 items-center justify-between gap-3 px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
            HF
          </span>
          HoraFlow
        </Link>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <details
            ref={detailsRef}
            className="group relative"
            onKeyDown={handleKeyDown}
          >
            <summary
              ref={summaryRef}
              aria-label="Abrir menu de navegação"
              className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md border border-input bg-background shadow-sm transition-colors hover:bg-accent [&::-webkit-details-marker]:hidden"
            >
              <Menu aria-hidden="true" className="size-4 group-open:hidden" />
              <X aria-hidden="true" className="hidden size-4 group-open:block" />
            </summary>

            <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg">
              <AppNav onNavigate={closeMenu} />
            </div>
          </details>
        </div>
      </div>
    </header>
  );
}
