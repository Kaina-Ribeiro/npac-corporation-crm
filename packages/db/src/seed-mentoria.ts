// Fixtures sintéticos do Acompanhamento para dev e demo: nunca rodam em produção (`seed-cli`).
// Contato e textos sensíveis são cifrados pela API; aqui ficam vazios.
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import type { Db } from './client.js';
import {
  account,
  mentoriaEnviosFisicos,
  mentoriaInscricoes,
  mentoriaMomentoInicial,
  mentoriaOnboardingEtapas,
  mentoriaPausas,
  mentoriaPerfis,
  mentoriaPessoas,
  mentoriaReunioes,
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
  {
    n: 9,
    mentoria: 'RDV',
    status: 'ONBOARDING',
    meses: null,
    pessoas: ['Mentorada Fictícia 11', 'Mentorado Fictício 12'],
  },
  { n: 10, mentoria: 'RDV', status: 'ONBOARDING', meses: null, pessoas: ['Mentorado Fictício 13'] },
  { n: 11, mentoria: '6M', status: 'ONBOARDING', meses: null, pessoas: ['Mentorada Fictícia 14'] },
  { n: 12, mentoria: 'RDV', status: 'ONBOARDING', meses: null, pessoas: ['Mentorado Fictício 15'] },
  {
    n: 13,
    mentoria: 'RDV',
    status: 'ONBOARDING',
    meses: null,
    pessoas: ['Mentorada Fictícia 16', 'Mentorado Fictício 17'],
  },
  { n: 14, mentoria: 'RDV', status: 'ONBOARDING', meses: null, pessoas: ['Mentorado Fictício 18'] },
] as const;

const ETAPAS_SEED = [
  'BOAS_VINDAS',
  'GRUPOS',
  'AQUECIMENTO',
  'PME_AQUECIMENTO',
  'CAIXA',
  'IDR',
] as const;

/**
 * Onde cada inscrição em onboarding está: `feitas` passos de mensagem concluídos, o seguinte
 * enviado há `enviadaHa` dias (se houver), formulário preenchido e situação da Caixa.
 */
const ONBOARDING: Record<
  number,
  {
    feitas: number;
    enviadaHa?: number;
    formulario?: boolean;
    caixa?: { status: 'ENVIADO' | 'ENTREGUE'; enviadaHa: number };
  }
> = {
  4: { feitas: 0 },
  9: { feitas: 0, enviadaHa: 5 },
  10: { feitas: 1, formulario: true },
  11: { feitas: 2, enviadaHa: 1, formulario: true },
  12: { feitas: 3, enviadaHa: 6, formulario: true, caixa: { status: 'ENVIADO', enviadaHa: 25 } },
  13: { feitas: 4, formulario: true },
  14: { feitas: 4, formulario: true, caixa: { status: 'ENTREGUE', enviadaHa: 12 } },
};

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

      const o = i.status === 'ONBOARDING' ? ONBOARDING[i.n] : undefined;
      const haDias = (d: number) => sql`now() - make_interval(days => ${d})`;
      await tx.insert(mentoriaOnboardingEtapas).values(
        ETAPAS_SEED.map((etapa, k) => {
          const base = { inscricaoId: id, etapa, criadoPor: duda };
          if (!o) return { ...base, status: 'ANTERIOR_AO_SISTEMA' };
          const formulario = k === 0 && o.formulario ? { formularioPreenchido: true } : {};
          if (k >= 4) return { ...base, status: 'PENDENTE' };
          if (k < o.feitas)
            return {
              ...base,
              ...formulario,
              status: 'CONCLUIDA',
              enviadaEm: haDias(4),
              concluidaEm: haDias(2),
            };
          if (k === o.feitas && o.enviadaHa !== undefined)
            return { ...base, ...formulario, status: 'ENVIADA', enviadaEm: haDias(o.enviadaHa) };
          return { ...base, ...formulario, status: 'PENDENTE' };
        }),
      );
      if (o?.caixa)
        await tx.insert(mentoriaEnviosFisicos).values({
          inscricaoId: id,
          tipo: 'CAIXA',
          status: o.caixa.status,
          enviadoEm: sql`(now() at time zone 'America/Sao_Paulo')::date - ${o.caixa.enviadaHa}::int`,
          entregueEm:
            o.caixa.status === 'ENTREGUE'
              ? sql`(now() at time zone 'America/Sao_Paulo')::date - 1`
              : null,
          rastreio: 'BR000000000FI',
          criadoPor: duda,
        });
      if (i.meses !== null) {
        await tx.execute(
          sql`select mentoria_gerar_acoes(${id}::uuid, (now() at time zone 'America/Sao_Paulo')::date)`,
        );
        // O que passou antes do mês atual já foi feito: sobra só o mês corrente para a equipe.
        await tx.execute(sql`update mentoria_acoes set status = 'FEITA', feita_em = now(),
            feita_por = ${duda}, itens_feitos = itens
          where inscricao_id = ${id}::uuid and mes < ${i.meses}`);
      }
      if (i.status === 'PAUSADO')
        await tx.insert(mentoriaPausas).values({
          inscricaoId: id,
          inicio: sql`(now() at time zone 'America/Sao_Paulo')::date - 10`,
          statusAnterior: 'ATIVO',
          pausadaPor: duda,
        });
    }

    // Reuniões de exemplo: a semana tem de tudo, e a Manu conduz uma (é o que lhe dá acesso).
    const quando = (dias: number, hora: string) =>
      sql`((now() at time zone 'America/Sao_Paulo')::date + ${dias}::int + ${hora}::time)
        at time zone 'America/Sao_Paulo'`;
    const reunioes = [
      {
        k: 1,
        n: 1,
        tipo: 'ACOMP_EMERGENCIA',
        quem: duda,
        dias: -10,
        hora: '10:00',
        status: 'REALIZADA',
      },
      {
        k: 2,
        n: 1,
        tipo: 'POSICIONAMENTO',
        quem: idDe('manu'),
        dias: 2,
        hora: '15:00',
        status: 'AGENDADA',
      },
      {
        k: 3,
        n: 2,
        tipo: 'ACOMP_EMERGENCIA',
        quem: duda,
        dias: 1,
        hora: '10:00',
        status: 'CONFIRMADA',
      },
      { k: 4, n: 5, tipo: 'MENSAL_6M', quem: duda, dias: 0, hora: '08:00', status: 'REALIZADA' },
      { k: 5, n: 7, tipo: 'MENSAL_6M', quem: duda, dias: -3, hora: '19:00', status: 'FALTOU' },
      { k: 6, n: 7, tipo: 'MENSAL_6M', quem: duda, dias: 3, hora: '19:00', status: 'LINK_ENVIADO' },
      { k: 7, n: 14, tipo: 'IDR', quem: idDe('leo'), dias: 1, hora: '21:00', status: 'AGENDADA' },
    ] as const;
    await tx
      .insert(mentoriaReunioes)
      .values(
        reunioes.map((r) => ({
          id: `00000000-0000-4000-9000-${String(r.k).padStart(12, '0')}`,
          inscricaoId: seedInscricaoId(r.n),
          tipo: r.tipo,
          conduzidaPor: r.quem,
          inicio: quando(r.dias, r.hora) as unknown as Date,
          plataforma: r.tipo === 'IDR' ? 'ZOOM' : 'MEET',
          status: r.status,
          criadoPor: duda,
        })),
      )
      .onConflictDoNothing({ target: mentoriaReunioes.id });
  });
}
