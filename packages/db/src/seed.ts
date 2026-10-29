// Seed idempotente do time e das etapas do pipeline. Papéis e flags são dados,
// nunca regras no código. O hash de senha é injetado (o seed não conhece o auth).
import { randomUUID } from 'node:crypto';
import type { Role, StageKey } from '@npac/shared';
import type { Db } from './client.js';
import { account, pipelineStages, user } from './schema/index.js';
import { seedPlaybook } from './seed-playbook.js';
import { seedProducts } from './seed-products.js';

export interface SeedOptions {
  hashPassword(p: string): Promise<string>;
  initialPassword: string;
}

const STAGES: { key: StageKey; label: string }[] = [
  { key: 'SONDAGEM', label: 'Criando Relacionamento' },
  { key: 'AGENDADO_DIRETO', label: 'Agendado Direto' },
  { key: 'EM_FOLLOW', label: 'Em Follow-up' },
  { key: 'AGENDADO_FOLLOW', label: 'Agendado do Follow' },
  { key: 'AGENDOU_PAGAMENTO', label: 'Agendou Pagamento 💳' },
  { key: 'NO_SHOW', label: 'No-Show' },
  { key: 'VENDA', label: 'Venda Fechada 🏆' },
  { key: 'PERDIDO', label: 'Sem Perfil' },
];

const TEAM: {
  name: string;
  username: string;
  email: string;
  role: Role;
  canProspect: boolean;
  canClose: boolean;
}[] = [
  {
    name: 'Ana',
    username: 'ana',
    email: 'ana@npac.com.br',
    role: 'HEAD',
    canProspect: true,
    canClose: false,
  },
  {
    name: 'Ronaldo',
    username: 'ronaldo',
    email: 'ronaldo@npac.com.br',
    role: 'HEAD',
    canProspect: false,
    canClose: true,
  },
  {
    name: 'Ale',
    username: 'ale',
    email: 'ale@npac.com.br',
    role: 'SDR',
    canProspect: true,
    canClose: false,
  },
  {
    name: 'Murilo',
    username: 'murilo',
    email: 'murilo@npac.com.br',
    role: 'SDR',
    canProspect: true,
    canClose: false,
  },
  {
    name: 'Igor',
    username: 'igor',
    email: 'igor@npac.com.br',
    role: 'SDR',
    canProspect: true,
    canClose: false,
  },
  {
    name: 'Sônia',
    username: 'sonia',
    email: 'sonia@npac.com.br',
    role: 'CLOSER',
    canProspect: false,
    canClose: true,
  },
];

export async function seed(db: Db, opts: SeedOptions): Promise<void> {
  const hash = await opts.hashPassword(opts.initialPassword);

  await db.transaction(async (tx) => {
    await tx
      .insert(pipelineStages)
      .values(STAGES.map((s, i) => ({ ...s, position: i + 1 })))
      .onConflictDoNothing({ target: pipelineStages.key });

    const created = await tx
      .insert(user)
      .values(TEAM.map((m) => ({ id: randomUUID(), ...m, mustChangePassword: true })))
      .onConflictDoNothing({ target: user.email })
      .returning({ id: user.id });

    if (created.length > 0) {
      await tx.insert(account).values(
        created.map((u) => ({
          id: randomUUID(),
          accountId: u.id,
          providerId: 'credential',
          userId: u.id,
          password: hash,
        })),
      );
    }
    await seedProducts(tx);
    await seedPlaybook(tx);
  });
}
