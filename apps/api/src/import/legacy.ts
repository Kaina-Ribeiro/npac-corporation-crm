import {
  normalizeInstagram,
  normalizePhoneBR,
  type IncomeBand,
  type LeadSource,
  type MeetingOrigin,
  type StageKey,
  type Tier,
} from '@npac/shared';

/**
 * Normalizadores do export do Firebase. O app antigo não tinha esquema fixo, então cada
 * campo aceita apelidos e formatos brasileiros; o que não for reconhecido vira motivo
 * de rejeição no relatório (nunca um valor inventado).
 */
export type Raw = Record<string, unknown>;

export const plain = (v: unknown) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Primeiro campo presente entre os apelidos. */
export function pick(row: Raw, ...keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/** "R$ 2.500,00", "2500", "2.500", "10k", "10 mil", 2500 → centavos inteiros. */
export function parseMoneyBR(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  let s = String(v ?? '')
    .toLowerCase()
    .replace(/r\$|\s/g, '');
  if (!s) return null;
  let mult = 1;
  if (/(k|mil)$/.test(s)) {
    mult = 1000;
    s = s.replace(/(k|mil)$/, '');
  }
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  else if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [int, dec = ''] = s.split('.');
  const cents = (Number(int) * 100 + Number(dec.padEnd(2, '0'))) * mult;
  return Number.isSafeInteger(cents) ? cents : null;
}

/** Timestamp do Firestore, epoch ms, ISO ou dd/mm/aaaa [HH:mm] (horário de Brasília). */
export function parseDate(v: unknown): Date | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'object') {
    const t = v as { seconds?: number; _seconds?: number };
    const s = t.seconds ?? t._seconds;
    return typeof s === 'number' ? new Date(s * 1000) : null;
  }
  if (typeof v === 'number') return new Date(v);
  const s = String(v).trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T,]+(\d{2}):(\d{2}))?$/.exec(s);
  const d = br
    ? new Date(`${br[3]}-${br[2]}-${br[1]}T${br[4] ?? '12'}:${br[5] ?? '00'}:00-03:00`)
    : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Renda mensal → faixa. Valores < 1000 são lidos como milhares ("8" = 8 mil). Abaixo de R$ 5 mil não entra. */
export function incomeBand(v: unknown): IncomeBand | 'BELOW' | null {
  let reais: number | null;
  if (typeof v === 'number') reais = v;
  else {
    const text = String(v ?? '')
      .toLowerCase()
      .replace(/r\$/g, '')
      .trim();
    if (/(mais de|acima de|\+)\s*50|50\s*(k|mil)?\s*\+/.test(text)) return 'R50K_PLUS';
    const range = /([\d.,]+)\s*(k|mil)?\s*(?:a|até|ate|-)\s*([\d.,]+)\s*(k|mil)?/.exec(text);
    const first = range ? `${range[1]}${range[2] ?? range[4] ?? ''}` : text;
    const cents = parseMoneyBR(first);
    reais = cents === null ? null : cents / 100;
  }
  if (reais === null || !Number.isFinite(reais) || reais <= 0) return null;
  if (reais < 1000) reais *= 1000;
  if (reais < 5_000) return 'BELOW';
  if (reais < 8_000) return 'R5_8K';
  if (reais < 15_000) return 'R8_15K';
  if (reais < 50_000) return 'R15_50K';
  return 'R50K_PLUS';
}

const STAGES: [RegExp, StageKey][] = [
  [/^agendado (direto)?$|^agendado$/, 'AGENDADO_DIRETO'],
  [/^agendado follow|^follow agendado/, 'AGENDADO_FOLLOW'],
  [/^(em )?follow( up)?$/, 'EM_FOLLOW'],
  [/pagamento/, 'AGENDOU_PAGAMENTO'],
  [/no ?show|faltou/, 'NO_SHOW'],
  [/^(venda|vendido|fechado|ganho)/, 'VENDA'],
  [/^(perdido|perda|descartado)/, 'PERDIDO'],
  [/^sondagem|^novo|^prospec/, 'SONDAGEM'],
];
export function stageKey(v: unknown): StageKey | null {
  const text = plain(v);
  if (!text) return 'SONDAGEM';
  return STAGES.find(([re]) => re.test(text))?.[1] ?? null;
}

export function source(v: unknown): LeadSource {
  const text = plain(v);
  if (text.includes('insta')) return 'INSTAGRAM';
  if (text.includes('whats') || text.includes('zap')) return 'WHATSAPP';
  if (text.includes('indica')) return 'INDICACAO';
  return 'OUTRO';
}

export function tier(v: unknown): Tier {
  const t = String(v ?? '')
    .trim()
    .toUpperCase();
  return t === 'P0' || t === 'P1' || t === 'P2' ? t : 'P2';
}

export const origin = (v: unknown): MeetingOrigin =>
  plain(v).includes('follow') ? 'FOLLOW' : 'DIRETO';

export function meetingStatus(v: unknown): 'DONE' | 'NO_SHOW' | 'CANCELED' | null {
  const text = plain(v);
  if (/realizad|feita|done|compareceu/.test(text)) return 'DONE';
  if (/no ?show|faltou|nao compareceu/.test(text)) return 'NO_SHOW';
  if (/cancel/.test(text)) return 'CANCELED';
  return null;
}

export function payMethod(v: unknown): 'CARD' | 'PIX' | 'BANK_SLIP' | 'PARTIAL' {
  const text = plain(v);
  if (/cart|credito|card/.test(text)) return 'CARD';
  if (/boleto|parcel/.test(text)) return 'BANK_SLIP';
  if (/parcial|entrada|sinal/.test(text)) return 'PARTIAL';
  return 'PIX';
}

export const phone = (v: unknown) => (v ? normalizePhoneBR(String(v)) : null);
export const instagram = (v: unknown) => (v ? normalizeInstagram(String(v)) : null);

/** Coleção como objeto {id: doc} (export Firestore) ou lista com campo id. */
export function docs(v: unknown): [string, Raw][] {
  if (Array.isArray(v))
    return v
      .filter((d): d is Raw => !!d && typeof d === 'object')
      .map((d, i) => [String(d.id ?? d._id ?? `idx-${i}`), d]);
  if (v && typeof v === 'object')
    return Object.entries(v as Record<string, unknown>)
      .filter((e): e is [string, Raw] => !!e[1] && typeof e[1] === 'object')
      .map(([id, d]) => [id, d]);
  return [];
}
