import { BarChart3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Relatórios"
        eyebrow="Análises"
        description="Relatórios filtráveis com exportação CSV, XLSX e PDF a partir da mesma consulta."
        actions={<Badge variant="outline">Fase 4</Badge>}
      />
      <EmptyState
        icon={BarChart3}
        title="Nenhum relatório disponível"
        description="Os relatórios dependem das horas e dos fechamentos das fases anteriores. Não há dados para exportar neste momento."
      />
    </>
  );
}
