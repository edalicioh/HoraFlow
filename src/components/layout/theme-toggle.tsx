"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <span className="relative flex size-4 items-center justify-center">
        <Sun
          aria-hidden="true"
          className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0"
        />
        <Moon
          aria-hidden="true"
          className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100"
        />
      </span>
      <span className="sr-only">Alternar tema</span>
    </Button>
  );
}
