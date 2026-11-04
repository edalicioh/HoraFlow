import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function ClientsPage() {
  return (
    <>
      <PageHeader
        title="Clientes"
        eyebrow="Cadastros"
        description="Clientes com tarifa opcional, projetos vinculados e desativação segura."
        actions={<Badge variant="outline">Fase 1</Badge>}
      />
      <EmptyState
        icon={Users}
        title="Nenhum cliente cadastrado"
        description="O cadastro de clientes será implementado na Fase 1, após a aprovação da Fase 0. Nenhum registro de exemplo foi inserido."
      />
    </>
  );
}
