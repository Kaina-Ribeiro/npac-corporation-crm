import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestConnections, ownerSql } from '../src/testing.js';

// Pedido do cliente (Igor, 05/11/2026): o perfil é sempre o da faixa de renda, sem troca à mão.
const owner = ownerSql('npac_test_db');
let stage: string;

beforeEach(async () => {
  await owner`truncate chat_reads, chat_messages, chat_members, lgpd_requests, lead_notes, lead_tasks, lead_timeline, payments, deals, meetings, leads, pipeline_stages, "user" restart identity cascade`;
  await owner`insert into "user" (id, name, email, role, can_prospect) values ('u-ale', 'Ale', 'ale@npac.test', 'SDR', true)`;
  [{ id: stage }] = (await owner<{ id: string }[]>`
    insert into pipeline_stages (key, label, position) values ('SONDAGEM', 'Sondagem', 1) returning id`) as unknown as [
    { id: string },
  ];
});

afterAll(closeTestConnections);

async function insert(band: string, tier: string) {
  const [row] = await owner<{ id: string; tier: string }[]>`
    insert into leads (name, income_band, source, tier, stage_id, sdr_id, created_by, instagram)
    values ('Maria', ${band}, 'BIO', ${tier}, ${stage}, 'u-ale', 'u-ale', ${`maria.${band}`})
    returning id, tier`;
  return row!;
}

const tierOf = async (id: string) =>
  (await owner<{ tier: string }[]>`select tier from leads where id = ${id}`)[0]!.tier;

describe('perfil pela faixa de renda', () => {
  it('cadastro grava o perfil da faixa, seja qual for o enviado', async () => {
    expect((await insert('R5_8K', 'P0')).tier).toBe('P2');
    expect((await insert('R8_15K', 'P0')).tier).toBe('P1');
    expect((await insert('R15_50K', 'P2')).tier).toBe('P0');
    expect((await insert('R50K_PLUS', 'P2')).tier).toBe('P0');
  });

  it('trocar a faixa troca o perfil; trocar só o perfil não pega', async () => {
    const { id } = await insert('R5_8K', 'P2');
    await owner`update leads set income_band = 'R8_15K' where id = ${id}`;
    expect(await tierOf(id)).toBe('P1');
    await owner`update leads set tier = 'P0' where id = ${id}`;
    expect(await tierOf(id)).toBe('P1');
  });
});
