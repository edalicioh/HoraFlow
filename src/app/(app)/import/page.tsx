import { Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Importar"
        eyebrow="Histórico"
        description="Importação CSV/XLSX com prévia, validação e confirmação transacional."
        actions={<Badge variant="outline">Fase 5</Badge>}
      />
      <EmptyState
        icon={Upload}
        title="Nenhum arquivo importado"
        description="A importação será implementada na Fase 5. A planilha histórica real ainda não foi fornecida e nenhum dado sintético foi gravado como histórico."
      />
    </>
  );
}
