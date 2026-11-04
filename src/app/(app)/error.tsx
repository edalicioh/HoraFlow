"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle
          aria-hidden="true"
          className="size-6 text-destructive"
        />
      </div>
      <h1 className="text-lg font-semibold">Não foi possível carregar a página</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Ocorreu um erro inesperado. Detalhes técnicos não são exibidos na
        interface.
      </p>
      <Button className="mt-5" onClick={() => reset()}>
        Tentar novamente
      </Button>
    </div>
  );
}
