import { parseCents } from '@npac/shared/money';
import { brasiliaInput } from './client-api';

/**
 * Venda Fechada no cadastro (NPAC-39): a reunião que já aconteceu e, para quem registra venda,
 * a venda no fim do formulário. Sem 'use client': só a leitura dos campos, usada pelo `LeadForm`.
 * Os nomes começam com `sf_` para o formulário não os mandar como dados do lead.
 */
export const SOLD = {
  meetingAt: 'sf_sold_meeting_at',
  meetingCloser: 'sf_sold_meeting_closer',
  register: 'sf_sold_register',
  closedOn: 'sf_sold_closed_on',
  product: 'sf_sold_product',
  method: 'sf_sold_method',
  total: 'sf_sold_total',
  entry: 'sf_sold_entry',
  partAmount: 'sf_sold_part_amount',
  partDue: 'sf_sold_part_due',
} as const;

export const SALE_METHODS = [
  ['PIX', 'Pix'],
  ['CARD', 'Cartão'],
  ['BANK_SLIP', 'Boleto parcelado'],
  ['PARTIAL', 'Parcial: já pago + parcelas'],
] as const;
export type SaleMethod = (typeof SALE_METHODS)[number][0];
export const deferredMethod = (m: string) => m === 'PARTIAL' || m === 'BANK_SLIP';

/** Hoje em Brasília (AAAA-MM-DD), para o `max` da data da venda. */
export const spToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

export type SoldBody = {
  meeting: { scheduledAt: string; closerId: string };
  sale?: {
    closedOn: string;
    productId: string;
    method: SaleMethod;
    totalCents: number;
    entryCents: number;
    installments: { amountCents: number; dueAt: string }[];
    requestKey: string;
  };
};

/** Lê reunião e venda do formulário. Lança `Error` com a mensagem para o usuário. */
export function readSoldFields(form: FormData, requestKey: string): SoldBody {
  const get = (name: string) => String(form.get(name) ?? '').trim();
  const at = get(SOLD.meetingAt);
  const closerId = get(SOLD.meetingCloser);
  if (!at || !closerId) throw new Error('Informe a data, a hora e o closer da reunião.');
  const scheduledAt = brasiliaInput(at)!;
  if (new Date(scheduledAt).getTime() > Date.now())
    throw new Error('A reunião ainda não aconteceu: informe um horário passado.');
  const body: SoldBody = { meeting: { scheduledAt, closerId } };
  if (form.get(SOLD.register) !== 'on') return body;

  const closedOn = get(SOLD.closedOn);
  const productId = get(SOLD.product);
  if (!closedOn) throw new Error('Informe a data da venda.');
  if (closedOn > spToday()) throw new Error('A data da venda não pode ser futura.');
  if (!productId) throw new Error('Escolha o produto da venda.');
  const method = get(SOLD.method) as SaleMethod;
  const totalCents = parseCents(get(SOLD.total));
  const deferred = deferredMethod(method);
  const entryCents = method === 'PARTIAL' ? parseCents(get(SOLD.entry)) : 0;
  const dues = form.getAll(SOLD.partDue).map(String);
  const installments = deferred
    ? form.getAll(SOLD.partAmount).map((a, i) => ({
        amountCents: parseCents(String(a)),
        dueAt: brasiliaInput(dues[i] ?? '') ?? '',
      }))
    : [];
  if (totalCents <= 0) throw new Error('Informe o valor total da venda.');
  if (method === 'PARTIAL' && (entryCents <= 0 || entryCents >= totalCents))
    throw new Error('No Parcial, o já pago fica entre zero e o total.');
  if (installments.some((p) => p.amountCents <= 0 || !p.dueAt))
    throw new Error('Informe o valor e o vencimento de cada parcela.');
  if (installments.some((p) => new Date(p.dueAt).getTime() <= Date.now()))
    throw new Error('As parcelas que faltam vencem no futuro.');
  if (deferred && entryCents + installments.reduce((a, p) => a + p.amountCents, 0) !== totalCents)
    throw new Error('Já pago + parcelas precisa fechar o valor total.');
  body.sale = { closedOn, productId, method, totalCents, entryCents, installments, requestKey };
  return body;
}
