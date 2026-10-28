import { hash } from '@node-rs/argon2';
import { createDb, seed } from '@npac/db';
import { closeTestConnections, ownerSql, resetTestDb } from '@npac/db/testing';
import { E2E_DB, E2E_PASSWORD } from './env.js';

/** Banco limpo + seed sem troca obrigatória de senha + um lead do Ale e um do Murilo. */
export default async function globalSetup(): Promise<void> {
  const url = await resetTestDb(E2E_DB);
  const client = createDb(url, { max: 1 });
  try {
    await seed(client.db, { hashPassword: (p) => hash(p), initialPassword: E2E_PASSWORD });
  } finally {
    await client.close();
  }
  const owner = ownerSql(E2E_DB);
  await owner`update "user" set must_change_password = false`;
  await owner`
    insert into leads (name, instagram, income_band, source, tier, stage_id, sdr_id, created_by)
    select l.name, l.insta, 'R10_20K', 'INSTAGRAM', 'P1', s.id, u.id, u.id
    from (values ('Lead do Ale', 'lead.do.ale', 'ale@npac.com.br'),
                 ('Lead do Murilo', 'lead.do.murilo', 'murilo@npac.com.br')) as l(name, insta, email)
    join "user" u on u.email = l.email
    join pipeline_stages s on s.key = 'SONDAGEM'`;
  await closeTestConnections();
}
