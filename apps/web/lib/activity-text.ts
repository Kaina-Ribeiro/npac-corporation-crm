const SP = 'America/Sao_Paulo';

const VERB: Record<string, string> = {
  'lead.created': 'cadastrou',
  'lead.updated': 'atualizou os dados de',
  'lead.moved': 'mudou a etapa de',
  'lead.reassigned': 'trocou o responsável de',
  'lead.deleted': 'excluiu',
  'note.created': 'anotou em',
  'note.updated': 'editou uma nota de',
  'task.created': 'criou uma tarefa para',
  'task.updated': 'atualizou uma tarefa de',
  'meeting.scheduled': 'agendou',
  'meeting.rescheduled': 'remarcou a reunião de',
  'meeting.canceled': 'cancelou a reunião de',
  'meeting.outcome': 'registrou o resultado da reunião de',
  'sale.registered': 'registrou a venda de',
  'sale.reversed': 'estornou a venda de',
  'payment.received': 'recebeu um pagamento de',
};

const spDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: SP }).format(d);

export function activityWhen(iso: string) {
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone: SP,
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
  const day = spDay(d);
  if (day === spDay(new Date())) return `Hoje, ${time}`;
  if (day === spDay(new Date(Date.now() - 86_400_000))) return `Ontem, ${time}`;
  const date = new Intl.DateTimeFormat('pt-BR', { timeZone: SP, day: '2-digit', month: '2-digit' });
  return `${date.format(d)}, ${time}`;
}

/** Frase do que a pessoa fez no lead ("registrou a venda de"), para feed e avisos. */
export const activityVerb = (kind: string) => VERB[kind] ?? 'alterou';
