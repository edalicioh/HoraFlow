import { Settings2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsForm } from "@/modules/settings/components/settings-form";
import { getSettings } from "@/modules/settings/service";
import { formatCentsAsBRL } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Configurações"
        eyebrow="Preferências"
        description="Fuso horário e tarifa global persistidos em um único registro no servidor. A moeda permanece BRL no MVP."
        actions={<Badge variant="secondary">Singleton</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings2 aria-hidden="true" className="size-5 text-primary" />
              Configuração global
            </CardTitle>
            <CardDescription>
              Alterações são validadas com Zod no servidor e registradas na
              auditoria.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm
              settings={{
                timezone: settings.timezone,
                currency: settings.currency,
                defaultHourlyRateCents: settings.defaultHourlyRateCents,
              }}
            />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Valores atuais</CardTitle>
            <CardDescription>
              Leitura do registro persistido neste momento.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-4 border-b pb-3">
                <dt className="text-muted-foreground">Fuso horário</dt>
                <dd className="font-medium">{settings.timezone}</dd>
              </div>
              <div className="flex items-center justify-between gap-4 border-b pb-3">
                <dt className="text-muted-foreground">Moeda</dt>
                <dd className="font-medium">{settings.currency}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Tarifa global</dt>
                <dd className="font-medium">
                  {formatCentsAsBRL(settings.defaultHourlyRateCents)}/h
                </dd>
              </div>
            </dl>
            <p className="mt-5 text-xs text-muted-foreground">
              O sistema não permite alterar a moeda nem expõe campo para isso.
              Uma política de troca com histórico precisa ser aprovada antes de
              qualquer mudança.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
