import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "HoraFlow",
    template: "%s · HoraFlow",
  },
  description: "Controle local de horas, projetos e faturamento.",
  applicationName: "HoraFlow",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          Pular para o conteúdo
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
