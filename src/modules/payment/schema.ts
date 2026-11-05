import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import { MAX_CENTS, parseBRLToCents } from "@/lib/money";
import { civilDateSchema } from "@/modules/time-entry/schema";
import { billingPeriodIdSchema, billingReasonSchema } from "@/modules/billing/schema";

export const PAYMENT_METHODS = [
  "PIX",
  "Transferência / TED",
  "Boleto",
  "Cartão",
  "Dinheiro",
  "Outro",
] as const;

export const paymentIdSchema = z
  .string()
  .trim()
  .uuid("Identificador de pagamento inválido.");

export const paymentMethodSchema = z
  .string()
  .trim()
  .min(1, "Selecione ou informe a forma de pagamento.")
  .max(80, "A forma de pagamento deve ter no máximo 80 caracteres.");

export const paymentNoteSchema = z
  .string()
  .trim()
  .max(500, "A observação deve ter no máximo 500 caracteres.")
  .optional()
  .nullable()
  .transform((val) => {
    if (!val || val.trim() === "") {
      return null;
    }
    return val.trim();
  });

export const operationIdSchema = z
  .string()
  .trim()
  .uuid("Identificador de operação inválido.")
  .optional()
  .nullable()
  .transform((val) => (val && val.length > 0 ? val : null));

export const voidPaymentSchema = z.object({
  paymentId: paymentIdSchema,
  reason: billingReasonSchema,
});

export function validatePaymentId(id: string): string {
  const parsed = paymentIdSchema.safeParse(id);
  if (!parsed.success) {
    throw new ValidationError("Identificador de pagamento inválido.", {
      paymentId: parsed.error.issues.map((issue) => issue.message),
    });
  }
  return parsed.data;
}

export function resolvePaymentAmountCents(input: {
  amountCents?: number;
  amountBRL?: string;
}): number {
  if (input.amountCents !== undefined) {
    if (
      typeof input.amountCents !== "number" ||
      !Number.isSafeInteger(input.amountCents) ||
      input.amountCents <= 0 ||
      input.amountCents > MAX_CENTS
    ) {
      throw new ValidationError("O valor do pagamento deve ser positivo.", {
        amount: ["Informe um valor positivo válido para o pagamento."],
      });
    }
    return input.amountCents;
  }

  if (input.amountBRL === undefined || input.amountBRL.trim() === "") {
    throw new ValidationError("Informe o valor do pagamento.", {
      amount: ["Informe o valor do pagamento."],
    });
  }

  let cents: number | null;
  try {
    cents = parseBRLToCents(input.amountBRL);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ValidationError("Valor do pagamento inválido.", {
        amount: [error.message],
      });
    }
    throw error;
  }

  if (cents === null || cents <= 0) {
    throw new ValidationError("O valor do pagamento deve ser maior que zero.", {
      amount: ["O valor do pagamento deve ser maior que R$ 0,00."],
    });
  }

  return cents;
}

export function validateCreatePaymentFields(input: {
  billingPeriodId: string;
  amountCents?: number;
  amountBRL?: string;
  paidDate?: string;
  paidAt?: Date;
  method: string;
  note?: string | null;
  operationId?: string | null;
}): {
  billingPeriodId: string;
  amountCents: number;
  paidDate: string | null;
  paidAt: Date | null;
  method: string;
  note: string | null;
  operationId: string | null;
} {
  const periodParsed = billingPeriodIdSchema.safeParse(input.billingPeriodId);
  if (!periodParsed.success) {
    throw new ValidationError("Competência inválida.", {
      billingPeriodId: periodParsed.error.issues.map((i) => i.message),
    });
  }

  const methodParsed = paymentMethodSchema.safeParse(input.method);
  if (!methodParsed.success) {
    throw new ValidationError("Forma de pagamento inválida.", {
      method: methodParsed.error.issues.map((i) => i.message),
    });
  }

  const noteParsed = paymentNoteSchema.safeParse(input.note ?? null);
  if (!noteParsed.success) {
    throw new ValidationError("Observação inválida.", {
      note: noteParsed.error.issues.map((i) => i.message),
    });
  }

  const opParsed = operationIdSchema.safeParse(input.operationId ?? null);
  if (!opParsed.success) {
    throw new ValidationError("Identificador de operação inválido.", {
      operationId: opParsed.error.issues.map((i) => i.message),
    });
  }

  const amountCents = resolvePaymentAmountCents({
    amountCents: input.amountCents,
    amountBRL: input.amountBRL,
  });

  if (input.paidAt instanceof Date) {
    if (Number.isNaN(input.paidAt.getTime())) {
      throw new ValidationError("Data do pagamento inválida.", {
        paidDate: ["Data do pagamento inválida."],
      });
    }
    return {
      billingPeriodId: periodParsed.data,
      amountCents,
      paidDate: null,
      paidAt: input.paidAt,
      method: methodParsed.data,
      note: noteParsed.data,
      operationId: opParsed.data,
    };
  }

  const dateParsed = civilDateSchema.safeParse(input.paidDate ?? "");
  if (!dateParsed.success) {
    throw new ValidationError("Data do pagamento inválida.", {
      paidDate: dateParsed.error.issues.map((i) => i.message),
    });
  }

  return {
    billingPeriodId: periodParsed.data,
    amountCents,
    paidDate: dateParsed.data,
    paidAt: null,
    method: methodParsed.data,
    note: noteParsed.data,
    operationId: opParsed.data,
  };
}
