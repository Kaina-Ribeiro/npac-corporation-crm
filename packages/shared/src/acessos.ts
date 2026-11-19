/**
 * Textos do acesso por área (NPAC-54, Fase 3): "entrou há X" (D12) e as frases do registro de
 * acessos da Diretoria (D10, D11). Sem zod e sem dependência: lido no cliente
 * (`@npac/shared/acessos`).
 */

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

/** Dia do calendário de Brasília (AAAA-MM-DD) de um instante. */
const diaBrasilia = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);

/** Dias de calendário (Brasília) entre dois instantes. */
const diasEntre = (antes: Date, depois: Date) =>
  Math.round((Date.parse(diaBrasilia(depois)) - Date.parse(diaBrasilia(antes))) / DIA);

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Última vez que a pessoa usou o sistema (`ultimoUso` de GET admin/users; M12), em português:
 * minutos e horas até 24 h; depois, dias de calendário de Brasília ("ontem", até 6 dias "entrou há",
 * a partir de 7 "não entra há").
 */
export function entrouHa(ultimoUso: string | null, agora: Date = new Date()): string {
  if (!ultimoUso) return 'nunca entrou';
  const uso = new Date(ultimoUso);
  const ms = agora.getTime() - uso.getTime();
  if (ms < MIN) return 'entrou agora';
  if (ms < HORA) return `entrou há ${plural(Math.floor(ms / MIN), 'minuto', 'minutos')}`;
  if (ms < DIA) return `entrou há ${plural(Math.floor(ms / HORA), 'hora', 'horas')}`;
  const dias = Math.max(1, diasEntre(uso, agora));
  if (dias === 1) return 'entrou ontem';
  if (dias < 7) return `entrou há ${dias} dias`;
  return `não entra há ${dias} dias`;
}
