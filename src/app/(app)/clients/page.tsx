import Link from "next/link";
import { Search, Users } from "lucide-react";
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
import { ClientCard } from "@/modules/client/components/client-card";
import { ClientCreateForm } from "@/modules/client/components/client-create-form";
import { parseClientListFilter } from "@/modules/client/schema";
import { listClients } from "@/modules/client/service";

export const dynamic = "force-dynamic";

type ClientsPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
  }>;
};

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const rawParams = await searchParams;
  const filter = parseClientListFilter({
    query: firstParam(rawParams.q),
    status: firstParam(rawParams.status),
  });

  const { clients, defaultHourlyRateCents } = await listClients(filter);
  const hasActiveFilters =
    filter.query.length > 0 || filter.status !== "all";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Clientes"
        eyebrow="Cadastros"
        description="Cadastre clientes com tarifa padrão opcional, acompanhe projetos associados e desative cadastros preservando todo o histórico."
        actions={
          <Badge variant="secondary">
            Tarifa global: {formatCentsAsBRL(defaultHourlyRateCents)}/h
          </Badge>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Novo cliente</CardTitle>
          <CardDescription>
            A tarifa do cliente é opcional. Se não informada, projetos sem
            tarifa própria utilizam a tarifa global.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ClientCreateForm defaultHourlyRateCents={defaultHourlyRateCents} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search aria-hidden="true" className="size-4 text-primary" />
            Filtrar clientes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            method="get"
            action="/clients"
            className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px_auto]"
          >
            <div className="space-y-1.5">
              <Label htmlFor="clients-filter-q">Buscar por nome ou descrição</Label>
              <Input
                id="clients-filter-q"
                name="q"
                defaultValue={filter.query}
                placeholder="Digite parte do nome..."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="clients-filter-status">Status</Label>
              <Select
                id="clients-filter-status"
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
                  href="/clients"
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Limpar
                </Link>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            hasActiveFilters
              ? "Nenhum cliente encontrado para o filtro aplicado"
              : "Nenhum cliente cadastrado"
          }
          description={
            hasActiveFilters
              ? "Ajuste os termos de busca ou limpe o filtro de status para visualizar outros registros."
              : "Utilize o formulário acima para cadastrar o primeiro cliente."
          }
          action={
            hasActiveFilters ? (
              <Link
                href="/clients"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Ver todos os clientes
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {clients.length}{" "}
              {clients.length === 1
                ? "cliente listado"
                : "clientes listados"}
            </h2>
          </div>

          <div className="grid gap-4">
            {clients.map((client) => (
              <ClientCard key={client.id} client={client} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
