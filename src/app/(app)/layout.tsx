import type { ReactNode } from "react";
import { MobileHeader } from "@/components/layout/mobile-header";
import { AppSidebar } from "@/components/layout/app-sidebar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[16rem_1fr]">
      <AppSidebar />
      <div className="flex min-w-0 flex-col">
        <MobileHeader />
        <main
          id="conteudo"
          className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-10"
        >
          {children}
        </main>
        <footer className="border-t px-4 py-4 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
          HoraFlow · aplicação local, sem autenticação no MVP
        </footer>
      </div>
    </div>
  );
}
