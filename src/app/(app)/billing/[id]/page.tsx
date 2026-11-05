import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { formatInstantInTimeZone } from "@/lib/datetime";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { BillingPeriodDetailPanel } from "@/modules/billing/components/billing-period-detail-panel";
import { getBillingPeriodDetail } from "@/modules/billing/service";
import { getSettings } from "@/modules/settings/service";

export const dynamic = "force-dynamic";

type BillingDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BillingDetailPage({
  params,
}: BillingDetailPageProps) {
  const { id } = await params;
  const settings = await getSettings();
  const todayInZone = formatInstantInTimeZone(new Date(), settings.timezone);

  let detail;
  try {
    detail = await getBillingPeriodDetail(id);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      notFound();
    }
    throw error;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${detail.displayClientName} — ${detail.competenceLabel}`}
        eyebrow="Detalhe do fechamento"
        description="Itens congelados, recebimentos, estornos e histórico completo de auditoria da competência."
        actions={
          <Link
            href="/billing"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-elevated"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar para Faturamento
          </Link>
        }
      />

      <BillingPeriodDetailPanel
        detail={detail}
        defaultPaidDate={todayInZone.date}
      />
    </div>
  );
}
