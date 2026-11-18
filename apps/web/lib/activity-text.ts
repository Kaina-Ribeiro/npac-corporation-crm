const SP = 'America/Sao_Paulo';

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

/** Frase do que a pessoa fez no lead: a mesma do push do sino (`@npac/shared/activity`). */
export { activityVerb } from '@npac/shared/activity';

/** Nome legível dos campos que a timeline registra (só nomes, nunca valores). */
const FIELD_LABEL: Record<string, string> = {
  name: 'nome',
  phone: 'WhatsApp',
  instagram: 'Instagram',
  email: 'e-mail',
  incomeBand: 'faixa de renda',
  source: 'origem',
  tier: 'perfil',
  stageKey: 'etapa',
  sdrId: 'SDR',
  closerId: 'closer',
  nextContactAt: 'próximo contato',
  summary: 'resumo',
  // Campos por etapa (NPAC-38): Agendou Pagamento e Sem Perfil.
  payment: 'pagamento combinado',
  lostReason: 'motivo do Sem Perfil',
};

/** "nome, WhatsApp": campos de lead alterados, sem a etapa (o evento já diz que ela mudou). */
export const activityFields = (fields: string[]) =>
  fields
    .filter((f) => f !== 'stageKey' && FIELD_LABEL[f])
    .map((f) => FIELD_LABEL[f])
    .join(', ');
