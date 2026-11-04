import { Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Faturamento"
        eyebrow="Financeiro"
        description="Fechamentos por cliente e competência, pagamentos parciais, estornos e reabertura auditada."
        actions={<Badge variant="outline">Fase 3</Badge>}
      />
      <EmptyState
        icon={Receipt}
        title="Nenhum fechamento registrado"
        description="A estrutura financeira foi criada com revisões e snapshots aprovados, mas os fluxos de fechamento e pagamento pertencem à Fase 3 e não foram antecipados."
      />
    </>
  );
}
