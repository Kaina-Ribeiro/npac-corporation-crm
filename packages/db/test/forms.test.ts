import { afterAll, describe, expect, it } from 'vitest';
import { closeTestConnections, ownerSql } from '../src/testing.js';

const owner = ownerSql('npac_test_db');

afterAll(async () => {
  await closeTestConnections();
});

describe('form_responses', () => {
  it.each(['INSERT', 'UPDATE', 'DELETE'])('npac_app não tem %s direto', async (privilege) => {
    const [r] = await owner<{ ok: boolean }[]>`
      select has_table_privilege('npac_app', 'form_responses', ${privilege}) as ok`;
    expect(r!.ok).toBe(false);
  });

  it('npac_app lê sujeito à RLS forçada', async () => {
    const [r] = await owner<{ ok: boolean; rls: boolean; forced: boolean }[]>`
      select has_table_privilege('npac_app', 'form_responses', 'SELECT') as ok,
        c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c where c.relname = 'form_responses'`;
    expect(r).toEqual({ ok: true, rls: true, forced: true });
  });

  it('funções do webhook exigem usuário definido', async () => {
    const rows = await owner<{ proname: string; prosecdef: boolean }[]>`
      select proname, prosecdef from pg_proc
      where proname in ('form_find_lead', 'form_response_record', 'form_response_seen')
      order by proname`;
    expect(rows).toEqual([
      { proname: 'form_find_lead', prosecdef: true },
      { proname: 'form_response_record', prosecdef: true },
      { proname: 'form_response_seen', prosecdef: true },
    ]);
  });
});
