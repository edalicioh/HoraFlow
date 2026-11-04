import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-svh max-w-2xl items-center px-4 py-12">
      <EmptyState
        className="w-full"
        icon={FileQuestion}
        title="Página não encontrada"
        description="O endereço informado não existe ou foi movido."
        action={
          <Link href="/dashboard" className={buttonVariants()}>
            Voltar ao dashboard
          </Link>
        }
      />
    </div>
  );
}
