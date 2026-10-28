import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { FieldCrypto } from '../src/common/crypto/field-crypto.js';
import { importFirebase } from '../src/import/importer.js';
import * as L from '../src/import/legacy.js';
import { owner } from './helpers.js';

const crypto = new FieldCrypto(Buffer.alloc(32, 1), Buffer.alloc(32, 2));

describe('normalizadores do Firebase', () => {
  it('dinheiro brasileiro vira centavos inteiros', () => {
    expect(L.parseMoneyBR('R$ 2.500,00')).toBe(250000);
    expect(L.parseMoneyBR('18000')).toBe(1800000);
    expect(L.parseMoneyBR('3.000')).toBe(300000);
    expect(L.parseMoneyBR('2500,5')).toBe(250050);
    expect(L.parseMoneyBR('10k')).toBe(1000000);
    expect(L.parseMoneyBR(2999.99)).toBe(299999);
    expect(L.parseMoneyBR('abc')).toBeNull();
  });
  it('datas: Firestore, epoch, ISO e dd/mm/aaaa em Brasília', () => {
    expect(L.parseDate({ seconds: 1700000000 })?.toISOString()).toBe('2023-11-14T22:13:20.000Z');
    expect(L.parseDate({ _seconds: 0 })?.getTime()).toBe(0);
    expect(L.parseDate('10/01/2026 20:00')?.toISOString()).toBe('2026-01-10T23:00:00.000Z');
    expect(L.parseDate('2026-01-10T10:00:00Z')?.toISOString()).toBe('2026-01-10T10:00:00.000Z');
    expect(L.parseDate('31/02')).toBeNull();
  });
  it('renda vira faixa e bloqueia abaixo de 5 mil', () => {
    expect(L.incomeBand('R$ 8.000')).toBe('R5_10K');
    expect(L.incomeBand('10 a 20 mil')).toBe('R10_20K');
    expect(L.incomeBand('20k-50k')).toBe('R20_50K');
    expect(L.incomeBand('mais de 50 mil')).toBe('R50K_PLUS');
    expect(L.incomeBand(15)).toBe('R10_20K');
    expect(L.incomeBand('3.000')).toBe('BELOW');
    expect(L.incomeBand('')).toBeNull();
  });
  it('etapas, origem e status por apelido', () => {
    expect(L.stageKey('Agendado')).toBe('AGENDADO_DIRETO');
    expect(L.stageKey('Em Follow')).toBe('EM_FOLLOW');
    expect(L.stageKey('Agendado follow')).toBe('AGENDADO_FOLLOW');
    expect(L.stageKey('No-show')).toBe('NO_SHOW');
    expect(L.stageKey('Vendido')).toBe('VENDA');
    expect(L.stageKey('xyz')).toBeNull();
    expect(L.meetingStatus('Realizada')).toBe('DONE');
    expect(L.meetingStatus('faltou')).toBe('NO_SHOW');
    expect(L.payMethod('Cartão de crédito')).toBe('CARD');
  });
});

describe('importação', () => {
  const data = {
    leads: {
      fb1: {
        nome: 'Lead Firebase',
        telefone: '(11) 98888-1111',
        renda: 'R$ 12.000',
        etapa: 'Vendido',
        sdr: 'Ale',
        origem: 'Instagram',
        perfil: 'P1',
        criadoEm: { seconds: 1767225600 },
      },
      fb2: { nome: 'Renda baixa', telefone: '11977776666', renda: '3000', sdr: 'Ale' },
      fb3: { nome: 'Sem SDR', instagram: '@sem.sdr', renda: '8000', sdr: 'Fulano' },
      fb4: { nome: 'Duplicado', telefone: '11988881111', renda: '9000', sdr: 'murilo@npac.com.br' },
    },
    reunioes: [
      { id: 'r1', leadId: 'fb1', closer: 'Sônia', data: '05/01/2026 19:00', status: 'realizada' },
      { id: 'r2', leadId: 'fb2', closer: 'Sônia', data: '05/01/2026 19:00' },
    ],
    vendas: {
      v1: {
        leadId: 'fb1',
        produto: 'Nação Padrão',
        valor: 'R$ 3.000,00',
        data: '06/01/2026',
        pago: true,
      },
    },
  };

  beforeEach(async () => {
    await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, lead_timeline, meetings, leads`;
  });
  afterAll(async () => {
    await owner`truncate lgpd_requests, chat_reads, chat_messages, chat_members, payments, deals, lead_notes, lead_tasks, lead_timeline, meetings, leads`;
  });

  it('dry-run valida e não grava nada', async () => {
    const r = await importFirebase(owner, crypto, data, { dryRun: true });
    expect(r.leads.imported).toBe(1);
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from leads`;
    expect(n!.n).toBe(0);
  });

  it('importa com cifra, rejeita com motivo sem PII e é idempotente', async () => {
    const r = await importFirebase(owner, crypto, data, { dryRun: false });
    expect(r.leads).toEqual({ imported: 1, skipped: 0 });
    expect(r.meetings).toEqual({ imported: 1, skipped: 0 });
    expect(r.sales).toEqual({ imported: 1, skipped: 0 });
    expect(r.rejected).toEqual(
      expect.arrayContaining([
        { collection: 'leads', legacyId: 'fb2', reason: 'renda abaixo de R$ 5 mil' },
        { collection: 'leads', legacyId: 'fb3', reason: 'SDR não encontrado' },
        { collection: 'leads', legacyId: 'fb4', reason: 'contato duplicado' },
        { collection: 'meetings', legacyId: 'r2', reason: 'lead não importado' },
      ]),
    );
    expect(JSON.stringify(r)).not.toMatch(/98888|Renda baixa/);
    const [lead] = await owner<
      { phone_enc: Buffer; income_band: string; key: string; created_at: Date }[]
    >`select l.phone_enc, l.income_band, s.key, l.created_at from leads l join pipeline_stages s on s.id = l.stage_id`;
    expect(crypto.decrypt(lead!.phone_enc)).toBe('+5511988881111');
    expect(lead).toMatchObject({ income_band: 'R10_20K', key: 'VENDA' });
    const [deal] = await owner<
      { total_cents: number; paid: number }[]
    >`select d.total_cents, count(p.paid_at)::int as paid from deals d join payments p on p.deal_id = d.id group by d.id`;
    expect(deal).toEqual({ total_cents: 300000, paid: 1 });
    const again = await importFirebase(owner, crypto, data, { dryRun: false });
    expect(again.leads.skipped).toBe(1);
    expect(again.sales.skipped).toBe(1);
    const [n] = await owner<{ n: number }[]>`select count(*)::int as n from leads`;
    expect(n!.n).toBe(1);
  });
});
