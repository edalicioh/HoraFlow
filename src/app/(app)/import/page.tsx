import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { listClients } from "@/modules/client/service";
import { listProjects } from "@/modules/project/service";
import { ImportWizard } from "@/modules/import/components/import-wizard";
import { getImportBatchDetail } from "@/modules/import/service";
import type { ImportPreviewResult } from "@/modules/import/types";

export const dynamic = "force-dynamic";

type ImportPageProps = {
  searchParams: Promise<{
    batchId?: string;
  }>;
};

export default async function ImportPage({ searchParams }: ImportPageProps) {
  const params = await searchParams;
  const batchId = params.batchId?.trim() || null;

  const [{ clients }, { projects }] = await Promise.all([
    listClients({ status: "all" }),
    listProjects({ status: "all" }),
  ]);

  let initialPreview: ImportPreviewResult | null = null;
  if (batchId) {
    initialPreview = await getImportBatchDetail(batchId);
  }

  const activeClients = clients
    .filter((c) => c.active)
    .map((c) => ({ id: c.id, name: c.name }));

  const activeProjects = projects
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name, clientId: p.clientId }));

  return (
    <div className="space-y-6" data-testid="import-page">
      <PageHeader
        title="Importar Histórico"
        eyebrow="Carga de Dados"
        description="Wizard transacional para importação de apontamentos a partir de planilhas CSV ou XLSX com prévia detalhada, detecção de duplicidades e auditoria completa."
        actions={<Badge variant="default">Fase 5</Badge>}
      />

      <ImportWizard
        initialPreview={initialPreview}
        clients={activeClients}
        projects={activeProjects}
      />
    </div>
  );
}
