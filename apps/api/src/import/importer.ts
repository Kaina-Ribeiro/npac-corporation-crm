import { randomUUID } from 'node:crypto';
import type { Sql } from 'postgres';
import type { FieldCrypto } from '../common/crypto/field-crypto.js';
import * as L from './legacy.js';

export type ImportReport = {
  dryRun: boolean;
  leads: { imported: number; skipped: number };
  meetings: { imported: number; skipped: number };
  sales: { imported: number; skipped: number };
  /** Só IDs do Firebase e motivo; nada pessoal. */
  rejected: { collection: string; legacyId: string; reason: string }[];
};

class DryRun extends Error {}

/**
 * Importa o export do Firebase como owner (fora da RLS), numa única transação e de forma
 * idempotente por `legacy_id`. Com `dryRun` tudo é validado e desfeito no fim.
 */
export async function importFirebase(
  sql: Sql,
  crypto: FieldCrypto,
  data: Record<string, unknown>,
  opts: { dryRun: boolean; defaultSdrEmail?: string },
): Promise<ImportReport> {
  const report: ImportReport = {
    dryRun: opts.dryRun,
    leads: { imported: 0, skipped: 0 },
    meetings: { imported: 0, skipped: 0 },
    sales: { imported: 0, skipped: 0 },
    rejected: [],
  };
  const reject = (collection: string, legacyId: string, reason: string) => {
    report.rejected.push({ collection, legacyId, reason });
  };

  try {
    await sql.begin(async (tx) => {
      const users = await tx<
        { id: string; name: string; email: string; can_prospect: boolean; can_close: boolean }[]
      >`select id, name, email, can_prospect, can_close from "user"`;
      const findUser = (v: unknown) => {
        const key = L.plain(v);
        if (!key) return undefined;
        return users.find(
          (u) =>
            L.plain(u.email) === key ||
            L.plain(u.name) === key ||
            L.plain(u.name).split(' ')[0] === key,
        );
      };
      const fallbackSdr = opts.defaultSdrEmail ? findUser(opts.defaultSdrEmail) : undefined;
      const stages = new Map(
        (await tx<{ id: string; key: string }[]>`select id, key from pipeline_stages`).map((s) => [
          s.key,
          s.id,
        ]),
      );
      const products = await tx<
        { id: string; code: string; name: string; closer_id: string; price_cents: number }[]
      >`select id, code, name, closer_id, price_cents from products`;
      const leadIds = new Map<string, { id: string; sdrId: string; stageKey: string }>();
      for (const r of await tx<
        { legacy_id: string; id: string; sdr_id: string; key: string }[]
      >`select l.legacy_id, l.id, l.sdr_id, s.key from leads l join pipeline_stages s on s.id = l.stage_id where l.legacy_id is not null`)
        leadIds.set(r.legacy_id, { id: r.id, sdrId: r.sdr_id, stageKey: r.key });

      for (const [legacyId, row] of L.docs(L.pick(data, 'leads', 'Leads'))) {
        if (leadIds.has(legacyId)) {
          report.leads.skipped++;
          continue;
        }
        const name = String(L.pick(row, 'nome', 'name', 'cliente') ?? '').trim();
        const rawPhone = L.pick(row, 'telefone', 'whatsapp', 'phone', 'celular');
        const ph = L.phone(rawPhone);
        const ig = L.instagram(L.pick(row, 'instagram', 'insta', '@'));
        const band = L.incomeBand(L.pick(row, 'renda', 'income', 'faixaRenda', 'faturamento'));
        const stage = L.stageKey(L.pick(row, 'etapa', 'stage', 'status', 'fase'));
        const sdr = findUser(L.pick(row, 'sdr', 'responsavel', 'owner', 'sdrEmail')) ?? fallbackSdr;
        const closer = findUser(L.pick(row, 'closer', 'closerEmail'));
        const createdAt = L.parseDate(L.pick(row, 'criadoEm', 'createdAt', 'data', 'dataCadastro'));
        const why = !name
          ? 'sem nome'
          : rawPhone && !ph
            ? 'telefone inválido'
            : !ph && !ig
              ? 'sem telefone nem Instagram'
              : band === null
                ? 'renda ausente ou ilegível'
                : band === 'BELOW'
                  ? 'renda abaixo de R$ 5 mil'
                  : !stage
                    ? 'etapa desconhecida'
                    : !sdr
                      ? 'SDR não encontrado'
                      : null;
        if (why) {
          reject('leads', legacyId, why);
          continue;
        }
        const bidx = ph ? crypto.blindIndex(ph) : null;
        const [dup] = await tx`select 1 from leads where deleted_at is null and
          ((${bidx}::text is not null and phone_bidx = ${bidx}) or (${ig}::text is not null and instagram = ${ig}))`;
        if (dup) {
          reject('leads', legacyId, 'contato duplicado');
          continue;
        }
        const [lead] = await tx<{ id: string }[]>`
          insert into leads (name, phone_enc, phone_bidx, instagram, income_band, source, tier, stage_id,
            sdr_id, closer_id, next_contact_at, summary, created_by, created_at, updated_at, legacy_id)
          values (${name}, ${ph ? crypto.encrypt(ph) : null}, ${bidx}, ${ig}, ${band}, ${L.source(L.pick(row, 'origem', 'source', 'canal'))},
            ${L.tier(L.pick(row, 'perfil', 'tier', 'prioridade'))}, ${stages.get(stage!)!}, ${sdr!.id},
            ${closer?.can_close ? closer.id : null},
            ${L.parseDate(L.pick(row, 'proximoContato', 'nextContact', 'followUp'))},
            ${String(L.pick(row, 'obs', 'observacoes', 'resumo', 'summary', 'notas') ?? '').trim() || null},
            ${sdr!.id}, ${createdAt ?? new Date()}, ${createdAt ?? new Date()}, ${legacyId})
          returning id`;
        leadIds.set(legacyId, { id: lead!.id, sdrId: sdr!.id, stageKey: stage! });
        report.leads.imported++;
      }

      for (const [legacyId, row] of L.docs(L.pick(data, 'reunioes', 'meetings', 'agenda'))) {
        const [exists] = await tx`select 1 from meetings where legacy_id = ${legacyId}`;
        if (exists) {
          report.meetings.skipped++;
          continue;
        }
        const lead = leadIds.get(String(L.pick(row, 'leadId', 'lead', 'leadRef') ?? ''));
        const closer = findUser(L.pick(row, 'closer', 'closerEmail', 'vendedor'));
        const at = L.parseDate(L.pick(row, 'dataHora', 'data', 'scheduledAt', 'quando'));
        const why = !lead
          ? 'lead não importado'
          : !closer?.can_close
            ? 'closer não encontrado'
            : !at
              ? 'data ilegível'
              : null;
        if (why) {
          reject('meetings', legacyId, why);
          continue;
        }
        const status = L.meetingStatus(L.pick(row, 'status', 'resultado'));
        const created = L.parseDate(L.pick(row, 'criadoEm', 'createdAt')) ?? at!;
        const outcome = status === 'DONE' || status === 'NO_SHOW' ? status : null;
        await tx`insert into meetings (lead_id, closer_id, scheduled_at, origin, outcome, outcome_at,
            canceled_at, created_by, created_at, updated_at, legacy_id)
          values (${lead!.id}, ${closer!.id}, ${at!}, ${L.origin(L.pick(row, 'origem', 'tipo', 'origin'))},
            ${outcome}, ${outcome ? at! : null}, ${status === 'CANCELED' ? at! : null},
            ${lead!.sdrId}, ${created}, ${created}, ${legacyId})`;
        report.meetings.imported++;
      }

      for (const [legacyId, row] of L.docs(L.pick(data, 'vendas', 'sales', 'deals'))) {
        const [exists] = await tx`select 1 from deals where legacy_id = ${legacyId}`;
        if (exists) {
          report.sales.skipped++;
          continue;
        }
        const lead = leadIds.get(String(L.pick(row, 'leadId', 'lead', 'leadRef') ?? ''));
        const key = L.plain(L.pick(row, 'produto', 'product', 'plano'));
        const product = products.find((p) => L.plain(p.code) === key || L.plain(p.name) === key);
        const total = L.parseMoneyBR(L.pick(row, 'valor', 'total', 'value', 'preco'));
        const closedAt = L.parseDate(L.pick(row, 'data', 'fechadoEm', 'closedAt', 'createdAt'));
        const why = !lead
          ? 'lead não importado'
          : !product
            ? 'produto não encontrado'
            : !total || total > 2_000_000_000
              ? 'valor ilegível'
              : !closedAt
                ? 'data ilegível'
                : null;
        if (why) {
          reject('sales', legacyId, why);
          continue;
        }
        const [active] =
          await tx`select 1 from deals where lead_id = ${lead!.id} and reversed_at is null`;
        if (active) {
          reject('sales', legacyId, 'lead já tem venda ativa');
          continue;
        }
        const closer = findUser(L.pick(row, 'closer', 'vendedor'));
        const paid = /^(true|sim|pago|paga|quitad)/.test(
          L.plain(L.pick(row, 'pago', 'status', 'paid')),
        );
        const [deal] = await tx<{ id: string }[]>`
          insert into deals (lead_id, product_id, product_name, catalog_price_cents, closer_id, sdr_id,
            total_cents, method, request_key, created_by, closed_at, legacy_id)
          values (${lead!.id}, ${product!.id}, ${product!.name}, ${product!.price_cents},
            ${closer?.can_close ? closer.id : product!.closer_id}, ${lead!.sdrId}, ${total!},
            ${L.payMethod(L.pick(row, 'forma', 'pagamento', 'method'))}, ${randomUUID()}, ${lead!.sdrId},
            ${closedAt!}, ${legacyId})
          returning id`;
        await tx`insert into payments (deal_id, amount_cents, due_at, paid_at, paid_by, receipt_key)
          values (${deal!.id}, ${total!}, ${closedAt!}, ${paid ? closedAt! : null},
            ${paid ? lead!.sdrId : null}, ${paid ? randomUUID() : null})`;
        if (lead!.stageKey !== 'VENDA')
          await tx`update leads set stage_id = ${stages.get('VENDA')!} where id = ${lead!.id}`;
        report.sales.imported++;
      }

      await tx`insert into audit_log (action, entity_type, data)
        values ('import.firebase', 'import', ${tx.json({
          dryRun: opts.dryRun,
          leads: report.leads,
          meetings: report.meetings,
          sales: report.sales,
          rejected: report.rejected.length,
        })})`;
      if (opts.dryRun) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
  }
  return report;
}
