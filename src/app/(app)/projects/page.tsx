import { FolderKanban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projetos"
        eyebrow="Cadastros"
        description="Projetos vinculados a um cliente, com tarifa própria opcional e histórico preservado."
        actions={<Badge variant="outline">Fase 1</Badge>}
      />
      <EmptyState
        icon={FolderKanban}
        title="Nenhum projeto cadastrado"
        description="Os projetos serão implementados junto aos clientes, após a aprovação da Fase 0."
      />
    </>
  );
}
