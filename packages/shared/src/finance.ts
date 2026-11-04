export type ProductDTO = {
  id: string;
  name: string;
  closerId: string;
  closerName: string;
  priceCents: number;
};
export type PaymentDTO = {
  id: string;
  dealId: string;
  amountCents: number;
  dueAt: string;
  paidAt: string | null;
  version: number;
};
export type DealDTO = {
  id: string;
  leadId: string;
  productName: string;
  totalCents: number;
  method: string;
  reversedAt: string | null;
  version: number;
  payments: PaymentDTO[];
};
export type ReportDTO = {
  page: number;
  pageSize: number;
  totalLeads: number;
  metrics: Record<string, number>;
  byProduct: ReportRow[];
  bySdr: ReportRow[];
  byCloser: ReportRow[];
  /** Um ponto por dia do período (Brasília), dias vazios zerados. R$ de venda não vem para SDR. */
  daily: {
    date: string;
    leads: number;
    meetings: number;
    soldCents?: number;
    receivedCents?: number;
    /** Valor a receber por reunião realizada (P0 R$ 9, P1 R$ 7, P2 R$ 5). */
    meetingValueCents: number;
  }[];
  /** Vendido por dia no período anterior equivalente, alinhado dia a dia com `daily`. */
  previousDaily: { date: string; soldCents: number }[];
  leads: { id: string; name: string; stage: string; tier: string }[];
  from: string;
  to: string;
};
export type ReportRow = {
  id: string;
  name: string;
  sales: number;
  /** Ausente para SDR. */
  soldCents?: number;
  leads?: number;
  meetings?: number;
  done?: number;
  noShow?: number;
  p0?: number;
  p1?: number;
  p2?: number;
  direct?: number;
  follow?: number;
  ticketCents?: number;
  conversionBps?: number;
  noShowBps?: number;
};
/** Últimos acontecimentos da equipe (dashboard do Head): só tipo, autor e nome do lead. */
export type TeamActivityDTO = {
  items: {
    id: string;
    at: string;
    kind: string;
    actorName: string;
    leadId: string;
    leadName: string | null;
  }[];
};
export type ChargeDTO = {
  id: string;
  dealId: string;
  leadId: string;
  name: string;
  amountCents: number;
  dueAt: string;
  version: number;
};
