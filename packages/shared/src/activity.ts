/**
 * Verbo de cada evento da timeline ("registrou a venda de"), para o feed, o sino e o push do
 * sino (NPAC-48): a tela e o celular dizem a mesma frase. Sem zod (o web importa por
 * `@npac/shared/activity`).
 */
const VERB: Record<string, string> = {
  'lead.created': 'cadastrou',
  'lead.updated': 'atualizou os dados de',
  'lead.moved': 'mudou a etapa de',
  'lead.reassigned': 'trocou o responsável de',
  'lead.deleted': 'excluiu',
  'lead.called': 'marcou como chamado',
  'lead.contact_rescheduled': 'remarcou o contato de',
  'note.created': 'anotou em',
  'note.updated': 'editou uma nota de',
  'task.created': 'criou uma tarefa para',
  'task.updated': 'atualizou uma tarefa de',
  'meeting.scheduled': 'agendou',
  'meeting.rescheduled': 'remarcou a reunião de',
  'meeting.canceled': 'cancelou a reunião de',
  'meeting.outcome': 'registrou o resultado da reunião de',
  'meeting.confirmed': 'mandou a confirmação da reunião de',
  'sale.registered': 'registrou a venda de',
  'sale.pending': 'pediu o registro da venda de',
  'sale.reversed': 'estornou a venda de',
  'payment.pending': 'pediu para completar o pagamento de',
  'payment.received': 'recebeu um pagamento de',
  'form.received': 'recebeu o formulário de',
};

/** Frase do que a pessoa fez no lead ("registrou a venda de"), para feed e avisos. */
export const activityVerb = (kind: string) => VERB[kind] ?? 'alterou';
