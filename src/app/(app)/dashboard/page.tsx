import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { CalendarDays } from "lucide-react";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        eyebrow="Visão geral"
        description="O ponto de partida do HoraFlow. Os indicadores aparecerão quando houver apontamentos reais; nenhum número é fabricado nesta etapa."
        actions={<Badge variant="secondary">Fundação</Badge>}
      />

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Fundação entregue</CardTitle>
            <CardDescription>
              Aplicação navegável, banco migrável, configurações persistentes e
              testes-base preparados para as próximas fases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <li>Next.js App Router e TypeScript estrito</li>
              <li>Prisma/SQLite com migrations versionadas</li>
              <li>Configuração global em registro singleton</li>
              <li>Tema claro/escuro e navegação responsiva</li>
              <li>Healthcheck e execução em Docker</li>
              <li>Sem autenticação e sem dados fictícios</li>
            </ul>
          </CardContent>
        </Card>

        <EmptyState
          icon={CalendarDays}
          title="Ainda não há horas registradas"
          description="O calendário e o formulário de apontamentos serão implementados na Fase 2, após a aprovação dos cadastros. Este estado é real, não uma métrica simulada."
        />
      </div>
    </>
  );
}
