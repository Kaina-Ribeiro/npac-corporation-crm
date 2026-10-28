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
  leads: { id: string; name: string; stage: string; tier: string }[];
  from: string;
  to: string;
};
export type ReportRow = {
  id: string;
  name: string;
  sales: number;
  soldCents: number;
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
export type ChargeDTO = {
  id: string;
  dealId: string;
  leadId: string;
  name: string;
  amountCents: number;
  dueAt: string;
  version: number;
};
