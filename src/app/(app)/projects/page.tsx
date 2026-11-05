import Link from "next/link";
import { FolderKanban, Search } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatCentsAsBRL } from "@/lib/money";
import { listClients } from "@/modules/client/service";
import { ProjectCard } from "@/modules/project/components/project-card";
import { ProjectCreateForm } from "@/modules/project/components/project-create-form";
import { parseProjectListFilter } from "@/modules/project/schema";
import { listProjects } from "@/modules/project/service";

export const dynamic = "force-dynamic";

type ProjectsPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    clientId?: string | string[];
    status?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function ProjectsPage({
  searchParams,
}: ProjectsPageProps) {
  const rawParams = await searchParams;
  const filter = parseProjectListFilter({
    query: firstParam(rawParams.q),
    clientId: firstParam(rawParams.clientId),
    status: firstParam(rawParams.status),
  });

  const [{ projects, defaultHourlyRateCents }, { clients }] =
    await Promise.all([
      listProjects(filter),
      listClients(),
    ]);

  const selectableClients = clients.map((client) => ({
    id: client.id,
    name: client.name,
    active: client.active,
    hourlyRateCents: client.hourlyRateCents,
  }));

  const hasActiveFilters =
    filter.query.length > 0 ||
    filter.clientId.length > 0 ||
    filter.status !== "all";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Projetos"
        eyebrow="Cadastros"
        description="Gerencie projetos vinculados a um cliente, visualize a origem da tarifa efetiva (projeto, cliente ou global) e preserve o histórico ao desativar."
        actions={
          <Badge variant="secondary">
            Tarifa global: {formatCentsAsBRL(defaultHourlyRateCents)}/h
          </Badge>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Novo projeto</CardTitle>
          <CardDescription>
            Todo projeto pertence a exatamente um cliente. A tarifa efetiva
            segue a ordem projeto → cliente → global.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProjectCreateForm
            clients={selectableClients}
            defaultHourlyRateCents={defaultHourlyRateCents}
            defaultClientId={filter.clientId}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search aria-hidden="true" className="size-4 text-primary" />
            Filtrar projetos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            method="get"
            action="/projects"
            className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_220px_180px_auto]"
          >
            <div className="space-y-1.5">
              <Label htmlFor="projects-filter-q">
                Buscar por projeto, cliente ou descrição
              </Label>
              <Input
                id="projects-filter-q"
                name="q"
                defaultValue={filter.query}
                placeholder="Digite parte do nome..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="projects-filter-client">Filtrar por cliente</Label>
              <Select
                id="projects-filter-client"
                name="clientId"
                defaultValue={filter.clientId}
              >
                <option value="">Todos os clientes</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                    {!client.active ? " (inativo)" : ""}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="projects-filter-status">Status do projeto</Label>
              <Select
                id="projects-filter-status"
                name="status"
                defaultValue={filter.status}
              >
                <option value="all">Todos</option>
                <option value="active">Somente ativos</option>
                <option value="inactive">Somente inativos</option>
              </Select>
            </div>

            <div className="flex items-end gap-2">
              <Button type="submit" variant="secondary">
                Aplicar filtros
              </Button>
              {hasActiveFilters ? (
                <Link
                  href="/projects"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Limpar
                </Link>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={
            hasActiveFilters
              ? "Nenhum projeto encontrado para o filtro aplicado"
              : "Nenhum projeto cadastrado"
          }
          description={
            hasActiveFilters
              ? "Ajuste o cliente selecionado, o status ou o termo de busca."
              : "Cadastre um cliente ativo e utilize o formulário acima para criar o primeiro projeto."
          }
          action={
            hasActiveFilters ? (
              <Link
                href="/projects"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Ver todos os projetos
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {projects.length}{" "}
              {projects.length === 1
                ? "projeto listado"
                : "projetos listados"}
            </h2>
          </div>

          <div className="grid gap-4">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                clients={selectableClients}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
