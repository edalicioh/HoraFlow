import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock3, FolderKanban } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { ClientCard } from "@/modules/client/components/client-card";
import { getClient, listClients } from "@/modules/client/service";
import { ProjectCard } from "@/modules/project/components/project-card";
import { ProjectCreateForm } from "@/modules/project/components/project-create-form";

export const dynamic = "force-dynamic";

type ClientDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ClientDetailPage({
  params,
}: ClientDetailPageProps) {
  const { id } = await params;

  let client;
  try {
    client = await getClient(id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      notFound();
    }
    throw error;
  }

  const { clients: allClients } = await listClients();
  const selectableClients = allClients.map((item) => ({
    id: item.id,
    name: item.name,
    active: item.active,
    hourlyRateCents: item.hourlyRateCents,
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/clients"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <ArrowLeft aria-hidden="true" />
          Voltar para clientes
        </Link>
      </div>

      <PageHeader
        title={client.name}
        eyebrow="Detalhe do cliente"
        description="Gerencie os dados cadastrais, projetos vinculados e acompanhe a área reservada ao histórico de horas e fechamentos."
        actions={
          <Badge variant={client.active ? "default" : "secondary"}>
            {client.active ? "Cliente ativo" : "Cliente inativo"}
          </Badge>
        }
      />

      <ClientCard client={client} showDetailLink={false} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Projetos associados</h2>
            <p className="text-sm text-muted-foreground">
              Projetos herdam a tarifa deste cliente quando não possuem tarifa
              própria, ou a tarifa global quando o cliente também está em
              branco.
            </p>
          </div>
          <Link
            href={`/projects?clientId=${client.id}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Ver na tela de projetos
          </Link>
        </div>

        {client.active ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Novo projeto para {client.name}
              </CardTitle>
              <CardDescription>
                Vincule um projeto diretamente a este cliente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProjectCreateForm
                clients={selectableClients}
                defaultHourlyRateCents={client.defaultHourlyRateCents}
                defaultClientId={client.id}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Criação de projetos bloqueada para cliente inativo
              </CardTitle>
              <CardDescription>
                Reative o cliente acima caso precise cadastrar novos projetos ou
                registrar novos apontamentos. Os projetos existentes permanecem
                preservados abaixo sem alteração silenciosa de seu campo de
                status.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {client.projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Nenhum projeto vinculado a este cliente"
            description="Cadastre um projeto para permitir futuros lançamentos de horas."
          />
        ) : (
          <div className="grid gap-4">
            {client.projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={{
                  ...project,
                  clientName: client.name,
                  clientActive: client.active,
                  clientHourlyRateCents: client.hourlyRateCents,
                  canChangeClient: !project.hasHistory,
                }}
                clients={selectableClients}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">
            Histórico de horas e fechamentos
          </h2>
          <p className="text-sm text-muted-foreground">
            Área preparada para os apontamentos (Fase 2) e fechamentos
            financeiros (Fase 3), exibindo apenas dados reais persistidos.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 aria-hidden="true" className="size-4 text-primary" />
              Resumo histórico real
            </CardTitle>
            <CardDescription>
              Nenhum valor ou apontamento fictício é gerado.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">
                  Apontamentos registrados nos projetos
                </dt>
                <dd className="font-medium">
                  {client.timeEntryCount}{" "}
                  {client.timeEntryCount === 1
                    ? "apontamento"
                    : "apontamentos"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Períodos de fechamento
                </dt>
                <dd className="font-medium">
                  {client.billingPeriodCount}{" "}
                  {client.billingPeriodCount === 1 ? "período" : "períodos"}
                </dd>
              </div>
            </dl>

            <p className="text-xs text-muted-foreground">
              Os lançamentos detalhados de horas e os demonstrativos mensais de
              faturamento serão habilitados nas Fases 2 e 3.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
