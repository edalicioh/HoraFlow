import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export default function TimesheetPage() {
  return (
    <>
      <PageHeader
        title="Horas"
        eyebrow="Apontamentos"
        description="Área de trabalho principal para calendário mensal, lista e registro por duração ou intervalo."
        actions={<Badge variant="outline">Fase 2</Badge>}
      />
      <EmptyState
        icon={CalendarDays}
        title="Nenhum apontamento registrado"
        description="O calendário, os totais HH:mm e o formulário de horas dependem da aprovação dos cadastros e das políticas de competência e sobreposição."
      />
    </>
  );
}
