// Fixtures sintéticos do Acompanhamento para dev e demo: nunca rodam em produção (`seed-cli`).
// Contato e textos sensíveis são cifrados pela API; aqui ficam vazios.
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import {
  account,
  mentoriaInscricoes,
  mentoriaMomentoInicial,
  mentoriaPerfis,
  mentoriaPessoas,
  user,
} from './schema/index.js';

const EQUIPE = [
  { username: 'duda', name: 'Duda', perfil: 'ACOMPANHAMENTO', admin: true },
  { username: 'operacao', name: 'Operação', perfil: 'OPERACAO', admin: false },
  { username: 'manu', name: 'Manu', perfil: 'ESPECIALISTA', admin: false },
  { username: 'leo', name: 'Leo', perfil: 'MENTOR', admin: false },
] as const;

/** `meses`: há quantos meses a jornada começou; nulo = antes da IDR. */
const INSCRICOES = [
  { n: 1, mentoria: 'RDV', status: 'ATIVO', meses: 4, pessoas: ['Mentorado Fictício 01'] },
  {
    n: 2,
    mentoria: 'RDV',
    status: 'ATIVO',
    meses: 9,
    pessoas: ['Mentorada Fictícia 02', 'Mentorado Fictício 03'],
  },
  {
    n: 3,
    mentoria: 'RDV',
    status: 'ATIVO',
    meses: null,
    importada: true,
    pessoas: ['Mentorada Fictícia 04'],
  },
  { n: 4, mentoria: '2M', status: 'ONBOARDING', meses: null, pessoas: ['Mentorado Fictício 05'] },
  { n: 5, mentoria: '6M', status: 'ATIVO', meses: 3, pessoas: ['Mentorada Fictícia 06'] },
  { n: 6, mentoria: 'RDV', status: 'PAUSADO', meses: 6, pessoas: ['Mentorado Fictício 07'] },
  {
    n: 7,
    mentoria: '6M',
    status: 'ATIVO',
    meses: 7,
    pessoas: ['Mentorada Fictícia 08', 'Mentorado Fictício 09'],
  },
  { n: 8, mentoria: 'RDV', status: 'CANCELADO', meses: null, pessoas: ['Mentorada Fictícia 10'] },
] as const;

/** Ids fixos: repetir o seed não duplica, e o e2e abre a ficha direto. */
export const seedInscricaoId = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const norm = (nome: string) => nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export async function seedMentoria(db: Db): Promise<void> {
  await db.transaction(async (tx) => {
    const [carla] = await tx
      .select({ senha: account.password, troca: user.mustChangePassword })
      .from(user)
      .innerJoin(account, eq(account.userId, user.id))
      .where(eq(user.username, 'carla'));
    if (!carla) return;

    const criados = await tx
      .insert(user)
      .values(
        EQUIPE.map((m) => ({
          id: randomUUID(),
          name: m.name,
          username: m.username,
          email: `${m.username}@npac.com.br`,
          role: 'ACOMPANHAMENTO' as const,
          canProspect: false,
          canClose: false,
          mustChangePassword: carla.troca,
        })),
      )
      .onConflictDoNothing({ target: user.email })
      .returning({ id: user.id });
    if (criados.length)
      await tx.insert(account).values(
        criados.map((u) => ({
          id: randomUUID(),
          accountId: u.id,
          providerId: 'credential',
          userId: u.id,
          password: carla.senha,
        })),
      );

    const contas = await tx.select({ id: user.id, username: user.username }).from(user);
    const idDe = (username: string) => contas.find((c) => c.username === username)!.id;
    await tx
      .insert(mentoriaPerfis)
      .values(EQUIPE.map((m) => ({ userId: idDe(m.username), perfil: m.perfil, admin: m.admin })))
      .onConflictDoNothing({ target: mentoriaPerfis.userId });

    const duda = idDe('duda');
    for (const i of INSCRICOES) {
      const id = seedInscricaoId(i.n);
      const inicio =
        i.meses === null ? null : sql`(current_date - make_interval(months => ${i.meses}))::date`;
      const novas = await tx
        .insert(mentoriaInscricoes)
        .values({
          id,
          tipo: i.pessoas.length === 2 ? 'CASAL' : 'INDIVIDUAL',
          mentoria: i.mentoria,
          status: i.status,
          inicioJornada: inicio,
          dataIdr: i.mentoria === 'RDV' ? inicio : null,
          terminoPrevisto:
            i.meses === null
              ? null
              : sql`(current_date - make_interval(months => ${i.meses}) + interval '12 months')::date`,
          dataCompra: sql`(current_date - make_interval(months => ${(i.meses ?? 0) + 1}))::date`,
          valorCentavos: 2_400_000,
          formaPagamento: 'Pix',
          statusFinanceiro: 'EM_DIA',
          origem: 'INDICACAO',
          linkGrupo: i.n <= 2 ? 'https://chat.whatsapp.com/convite-ficticio' : null,
          responsavelId: duda,
          importada: 'importada' in i,
          criadoPor: duda,
        })
        .onConflictDoNothing({ target: mentoriaInscricoes.id })
        .returning({ id: mentoriaInscricoes.id });
      if (!novas.length) continue;
      await tx.insert(mentoriaPessoas).values(
        i.pessoas.map((nome, k) => ({
          inscricaoId: id,
          ordem: k + 1,
          nome,
          nomeNorm: norm(nome),
          apelido: nome.split(' ').slice(1).join(' '),
          criadoPor: duda,
        })),
      );
      if (i.meses !== null)
        await tx.insert(mentoriaMomentoInicial).values({
          inscricaoId: id,
          data: inicio,
          recebeCentavos: 1_200_000,
          custoCentavos: 950_000,
          temDividas: true,
          dividasCentavos: 3_800_000,
          guardadoCentavos: 420_000,
          travadoEm: sql`now()`,
          travadoPor: duda,
          criadoPor: duda,
        });
    }
  });
}
