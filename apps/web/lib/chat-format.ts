// Datas e agrupamento do Chat (redesign A1, 24/11/2026). Sem 'use client' e sem libs: só Intl.
const TZ = 'America/Sao_Paulo';
const DIA = 86_400_000;

/** Dia de Brasília como `AAAA-MM-DD` (o Brasil não tem horário de verão desde 2019). */
const chave = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DIA);

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const semana = (d: Date) =>
  maiuscula(d.toLocaleDateString('pt-BR', { timeZone: TZ, weekday: 'long' }).split('-')[0]!);

/** Hora curta da mensagem: "09:24". */
export const hora = (at: string) =>
  new Date(at).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });

/** Separador de dia: "Hoje", "Ontem" ou "Segunda, 23 de nov." (com o ano, se for outro). */
export function rotuloDia(at: string, agora = new Date()): string {
  const d = new Date(at);
  const dif = diasEntre(chave(d), chave(agora));
  if (dif === 0) return 'Hoje';
  if (dif === 1) return 'Ontem';
  const mesmoAno = chave(d).slice(0, 4) === chave(agora).slice(0, 4);
  const data = d.toLocaleDateString('pt-BR', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    ...(mesmoAno ? {} : { year: 'numeric' }),
  });
  return `${semana(d)}, ${data}`;
}

/** Quando, na lista de conversas: "10:08", "Ontem", "Segunda" (até 6 dias) ou "20/11". */
export function quandoNaLista(at: string, agora = new Date()): string {
  const d = new Date(at);
  const dif = diasEntre(chave(d), chave(agora));
  if (dif <= 0) return hora(at);
  if (dif === 1) return 'Ontem';
  if (dif < 7) return semana(d);
  const mesmoAno = chave(d).slice(0, 4) === chave(agora).slice(0, 4);
  return d.toLocaleDateString('pt-BR', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    ...(mesmoAno ? {} : { year: 'numeric' }),
  });
}

/** Mensagens seguidas do mesmo autor, no mesmo dia e com menos de 5 minutos entre elas. */
const JUNTAS_MS = 5 * 60_000;

export type Grupo<M> = { autorId: string; autor: string; mensagens: M[] };
export type Dia<M> = { chave: string; rotulo: string; grupos: Grupo<M>[] };

export function agrupar<M extends { authorId: string; authorName: string; createdAt: string }>(
  lista: M[],
  agora = new Date(),
): Dia<M>[] {
  const dias: Dia<M>[] = [];
  for (const m of lista) {
    const k = chave(new Date(m.createdAt));
    let dia = dias.at(-1);
    if (!dia || dia.chave !== k) {
      dia = { chave: k, rotulo: rotuloDia(m.createdAt, agora), grupos: [] };
      dias.push(dia);
    }
    const g = dia.grupos.at(-1);
    const ultima = g?.mensagens.at(-1);
    if (
      g &&
      ultima &&
      g.autorId === m.authorId &&
      Date.parse(m.createdAt) - Date.parse(ultima.createdAt) < JUNTAS_MS
    )
      g.mensagens.push(m);
    else dia.grupos.push({ autorId: m.authorId, autor: m.authorName, mensagens: [m] });
  }
  return dias;
}
