// `pnpm --filter @npac/api mock:prototype`: carrega no banco de DEV os dados de exemplo do
// protótipo aprovado (leads, reuniões, vendas, tarefas, notas e chat). Usa DATABASE_URL (owner).
// Idempotente pelos legacy_id `mock-*`. Recusa rodar em produção. Telefones são fictícios.
import postgres from 'postgres';
import { FieldCrypto } from '../common/crypto/field-crypto.js';
import { loadEnv } from '../config/env.js';
import { importFirebase } from '../import/importer.js';

type Mock = {
  id: string;
  nome: string;
  tier: 'P0' | 'P1' | 'P2';
  stage: string;
  sdr: string;
  closer: string | null;
  renda: number;
  insta: string;
  phone: string;
  dias: number; // criado há N dias
  ag?: 'D' | 'F';
  call?: { dia: number; hora: string; res?: 'feita' | 'noshow' };
  task?: { dia: number; hora: string; acao: string };
  venda?: { produto: string; valor: number; pago: number; dia: number; saldoDia?: number };
  nota: string;
};

const LEADS: Mock[] = [
  {
    id: 'l1',
    nome: 'Rafael Monteiro',
    tier: 'P0',
    stage: 'AGENDADO_DIRETO',
    sdr: 'Igor',
    closer: 'Ronaldo',
    renda: 60000,
    insta: 'rafaelmonteiro',
    phone: '11974312208',
    dias: 3,
    ag: 'D',
    call: { dia: 0, hora: '14:00' },
    nota: 'Dono de três clínicas odontológicas. Quer sair da operação e montar um time de gestão. Pediu para a esposa participar da call.',
  },
  {
    id: 'l2',
    nome: 'Juliana Prates',
    tier: 'P1',
    stage: 'AGENDADO_DIRETO',
    sdr: 'Ale',
    closer: 'Sônia',
    renda: 15000,
    insta: 'juprates',
    phone: '21988201174',
    dias: 2,
    ag: 'D',
    call: { dia: 0, hora: '16:30' },
    nota: 'Arquiteta autônoma, renda oscila muito. Quer previsibilidade e organizar as finanças da família.',
  },
  {
    id: 'l3',
    nome: 'Marcos Vilela',
    tier: 'P2',
    stage: 'AGENDADO_FOLLOW',
    sdr: 'Murilo',
    closer: 'Sônia',
    renda: 7000,
    insta: 'marcosvilela',
    phone: '31991073345',
    dias: 9,
    ag: 'F',
    call: { dia: 0, hora: '19:00' },
    nota: 'CLT no setor de logística. Esfriou depois do primeiro contato e voltou após o story de sexta.',
  },
  {
    id: 'l17',
    nome: 'Otávio Brandão',
    tier: 'P1',
    stage: 'AGENDADO_FOLLOW',
    sdr: 'Igor',
    closer: 'Sônia',
    renda: 30000,
    insta: 'otaviobrandao',
    phone: '11981236650',
    dias: 6,
    ag: 'F',
    call: { dia: 0, hora: '10:00', res: 'feita' },
    nota: 'Dentista, quer escalar o consultório. Call feita, pediu proposta por escrito.',
  },
  {
    id: 'l4',
    nome: 'Patrícia Nogueira',
    tier: 'P1',
    stage: 'EM_FOLLOW',
    sdr: 'Ana',
    closer: 'Sônia',
    renda: 30000,
    insta: 'patinogueira',
    phone: '41996548810',
    dias: 5,
    task: { dia: 0, hora: '11:00', acao: 'Confirmar interesse na Nação depois da live' },
    nota: 'Gerente comercial. Assistiu à live de terça e respondeu o direct perguntando sobre a próxima turma.',
  },
  {
    id: 'l5',
    nome: 'Diego Fontana',
    tier: 'P0',
    stage: 'EM_FOLLOW',
    sdr: 'Igor',
    closer: 'Ronaldo',
    renda: 80000,
    insta: 'diegofontana',
    phone: '48998124471',
    dias: 7,
    task: { dia: -1, hora: '17:00', acao: 'Retomar conversa: pediu para falar depois do feriado' },
    nota: 'Empresário do agro. Interessado na mentoria de 6 meses, mas quer conversar com o sócio antes.',
  },
  {
    id: 'l6',
    nome: 'Camila Arruda',
    tier: 'P2',
    stage: 'SONDAGEM',
    sdr: 'Ale',
    closer: null,
    renda: 6000,
    insta: 'camilaarruda',
    phone: '85987330921',
    dias: 0,
    task: { dia: 0, hora: '15:00', acao: 'Primeiro contato depois da resposta no story' },
    nota: 'Respondeu ao story sobre a imersão. Ainda entendendo o momento dela.',
  },
  {
    id: 'l7',
    nome: 'Henrique Salles',
    tier: 'P1',
    stage: 'SONDAGEM',
    sdr: 'Igor',
    closer: null,
    renda: 12000,
    insta: 'henriquesalles',
    phone: '51991402286',
    dias: 4,
    task: { dia: -3, hora: '10:00', acao: 'Enviar convite para a call de diagnóstico' },
    nota: 'Corretor de imóveis. Quer escalar vendas e montar equipe.',
  },
  {
    id: 'l8',
    nome: 'Beatriz Lacerda',
    tier: 'P1',
    stage: 'AGENDOU_PAGAMENTO',
    sdr: 'Murilo',
    closer: 'Sônia',
    renda: 15000,
    insta: 'bialacerda',
    phone: '62984517730',
    dias: 8,
    ag: 'F',
    call: { dia: -2, hora: '18:00', res: 'feita' },
    task: { dia: 1, hora: '10:00', acao: 'Pagamento agendado · Nação Padrão (R$ 3.000)' },
    nota: 'Fechou na call, vai pagar quando cair o salário.',
  },
  {
    id: 'l9',
    nome: 'André Quintela',
    tier: 'P0',
    stage: 'VENDA',
    sdr: 'Igor',
    closer: 'Ronaldo',
    renda: 90000,
    insta: 'andrequintela',
    phone: '11992886612',
    dias: 12,
    ag: 'D',
    call: { dia: -7, hora: '15:00', res: 'feita' },
    venda: { produto: 'Mentoria 2 Meses', valor: 30000, pago: 30000, dia: -7 },
    nota: 'Dono de rede de academias. Fechou na primeira call.',
  },
  {
    id: 'l10',
    nome: 'Larissa Toledo',
    tier: 'P1',
    stage: 'VENDA',
    sdr: 'Ana',
    closer: 'Sônia',
    renda: 25000,
    insta: 'larissatoledo',
    phone: '19997135540',
    dias: 1,
    ag: 'D',
    call: { dia: 0, hora: '09:00', res: 'feita' },
    venda: { produto: 'Nação Padrão', valor: 3000, pago: 3000, dia: 0 },
    nota: 'Advogada. Já acompanhava os conteúdos há dois anos.',
  },
  {
    id: 'l11',
    nome: 'Fábio Rezende',
    tier: 'P2',
    stage: 'VENDA',
    sdr: 'Igor',
    closer: 'Sônia',
    renda: 8000,
    insta: 'fabiorezende',
    phone: '27988041193',
    dias: 10,
    ag: 'F',
    call: { dia: -5, hora: '19:00', res: 'feita' },
    venda: { produto: 'Nação Completo', valor: 3500, pago: 1500, dia: -5, saldoDia: 8 },
    nota: 'Pagou entrada no Pix, saldo no próximo mês.',
  },
  {
    id: 'l18',
    nome: 'Gabriela Antunes',
    tier: 'P0',
    stage: 'VENDA',
    sdr: 'Ana',
    closer: 'Ronaldo',
    renda: 70000,
    insta: 'gabiantunes',
    phone: '11996401182',
    dias: 20,
    ag: 'D',
    call: { dia: -19, hora: '14:00', res: 'feita' },
    venda: { produto: 'Mentoria RDV', valor: 18000, pago: 18000, dia: -19 },
    nota: 'Empresária de moda. Fechou a RDV para estruturar o time.',
  },
  {
    id: 'l12',
    nome: 'Renata Duarte',
    tier: 'P0',
    stage: 'NO_SHOW',
    sdr: 'Ana',
    closer: 'Ronaldo',
    renda: 55000,
    insta: 'renataduarte',
    phone: '11981104437',
    dias: 6,
    ag: 'D',
    call: { dia: -4, hora: '16:00', res: 'noshow' },
    task: { dia: 0, hora: '10:00', acao: 'Resgatar no-show e remarcar com o Ronaldo' },
    nota: 'Faltou à call de sexta. Disse que teve uma emergência no trabalho.',
  },
  {
    id: 'l13',
    nome: 'Gustavo Paiva',
    tier: 'P2',
    stage: 'NO_SHOW',
    sdr: 'Murilo',
    closer: 'Sônia',
    renda: 6500,
    insta: 'gustavopaiva',
    phone: '71996203318',
    dias: 8,
    ag: 'F',
    call: { dia: -4, hora: '20:00', res: 'noshow' },
    nota: 'Não respondeu desde a falta.',
  },
  {
    id: 'l14',
    nome: 'Elisa Barcellos',
    tier: 'P1',
    stage: 'PERDIDO',
    sdr: 'Ale',
    closer: null,
    renda: 14000,
    insta: 'elisabarcellos',
    phone: '81995417702',
    dias: 15,
    nota: 'Busca outro tipo de solução no momento.',
  },
  {
    id: 'l15',
    nome: 'Tiago Moraes',
    tier: 'P0',
    stage: 'AGENDADO_DIRETO',
    sdr: 'Ana',
    closer: 'Ronaldo',
    renda: 100000,
    insta: 'tiagomoraes',
    phone: '11993772051',
    dias: 2,
    ag: 'D',
    call: { dia: 1, hora: '10:00' },
    nota: 'CEO de software house com 40 pessoas. Quer estrutura de liderança.',
  },
  {
    id: 'l16',
    nome: 'Vanessa Coelho',
    tier: 'P1',
    stage: 'AGENDADO_FOLLOW',
    sdr: 'Igor',
    closer: 'Sônia',
    renda: 35000,
    insta: 'vanessacoelho',
    phone: '61982709984',
    dias: 21,
    ag: 'F',
    call: { dia: 2, hora: '18:00' },
    nota: 'Médica. Voltou depois de três semanas de follow.',
  },
];

const CHAT_GERAL: [string, string, string | null][] = [
  ['Ana', 'Bom dia, time. Foco em resgatar os no-shows da semana passada antes do almoço.', null],
  [
    'Ronaldo',
    'Mesa pronta para as mentorias. Handoff bem preenchido acelera muito a call, valeu Igor pelo do',
    'l1',
  ],
  ['Sônia', 'Venda fechada na Nação Padrão. Bora para as próximas!', 'l10'],
  ['Igor', 'Boa, Sônia! Confirmado para as 19h:', 'l3'],
];
const CHAT_DM: [string, string, string | null][] = [
  ['Ronaldo', 'Ele respondeu? Quero puxar para quinta.', 'l5'],
  ['Igor', 'Ainda não. Pediu para falar depois do feriado, retomo hoje.', null],
];

/** Data no fuso de Brasília: hoje + `dia`, às `hora`. */
function brt(dia: number, hora = '12:00'): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  );
  const d = new Date(`${today}T${hora}:00-03:00`);
  d.setUTCDate(d.getUTCDate() + dia);
  return d.toISOString();
}

const env = loadEnv(process.env);
if (env.NODE_ENV === 'production') throw new Error('mock:prototype não roda em produção');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definida');
const sql = postgres(url, { max: 1 });
const crypto = new FieldCrypto(env.FIELD_ENCRYPTION_KEY, env.BLIND_INDEX_KEY);
const mid = (l: Mock) => `mock-${l.id}`;

try {
  const report = await importFirebase(
    sql,
    crypto,
    {
      leads: Object.fromEntries(
        LEADS.map((l) => [
          mid(l),
          {
            nome: l.nome,
            telefone: l.phone,
            instagram: l.insta,
            renda: l.renda,
            etapa: l.stage,
            sdr: l.sdr,
            closer: l.closer,
            perfil: l.tier,
            origem: 'Instagram',
            resumo: l.nota,
            criadoEm: brt(-l.dias, '09:30'),
          },
        ]),
      ),
      reunioes: LEADS.filter((l) => l.call && l.closer).map((l) => ({
        id: `${mid(l)}-call`,
        leadId: mid(l),
        closer: l.closer,
        data: brt(l.call!.dia, l.call!.hora),
        origem: l.ag === 'F' ? 'follow' : 'direto',
        status: l.call!.res === 'feita' ? 'realizada' : l.call!.res === 'noshow' ? 'no-show' : '',
        criadoEm: brt(Math.min(l.call!.dia, 0) - 1, '10:00'),
      })),
      vendas: LEADS.filter((l) => l.venda).map((l) => ({
        id: `${mid(l)}-venda`,
        leadId: mid(l),
        produto: l.venda!.produto,
        valor: l.venda!.valor,
        data: brt(l.venda!.dia, '17:00'),
        closer: l.closer,
        pago: l.venda!.pago === l.venda!.valor,
        forma: l.venda!.pago === l.venda!.valor ? 'pix' : 'parcial',
      })),
    },
    { dryRun: false },
  );

  await sql.begin(async (tx) => {
    const users = new Map(
      (await tx<{ id: string; name: string }[]>`select id, name from "user"`).map((u) => [
        u.name.split(' ')[0],
        u.id,
      ]),
    );
    const leadId = new Map(
      (
        await tx<{ legacy_id: string; id: string }[]>`
        select legacy_id, id from leads where legacy_id like 'mock-%'`
      ).map((r) => [r.legacy_id, r.id]),
    );
    for (const l of LEADS) {
      const id = leadId.get(mid(l));
      if (!id) continue;
      const sdr = users.get(l.sdr)!;
      const [hasNote] = await tx`select 1 from lead_notes where lead_id = ${id}`;
      if (!hasNote)
        await tx`insert into lead_notes (lead_id, body, created_by, created_at, updated_at)
          values (${id}, ${l.nota}, ${sdr}, ${brt(-l.dias, '09:45')}, ${brt(-l.dias, '09:45')})`;
      const [hasTask] = await tx`select 1 from lead_tasks where lead_id = ${id}`;
      if (l.task && !hasTask)
        await tx`insert into lead_tasks (lead_id, title, assignee_id, due_at, created_by)
          values (${id}, ${l.task.acao}, ${sdr}, ${brt(l.task.dia, l.task.hora)}, ${sdr})`;
      // Venda parcial: entrada paga + saldo futuro (o importador cria parcela única).
      if (l.venda && l.venda.pago < l.venda.valor) {
        const pays = await tx<{ id: string }[]>`
          select p.id from payments p join deals d on d.id = p.deal_id where d.lead_id = ${id}`;
        if (pays.length === 1) {
          await tx`update payments set amount_cents = ${l.venda.pago * 100}, paid_at = due_at,
            paid_by = ${sdr}, receipt_key = gen_random_uuid() where id = ${pays[0]!.id}`;
          await tx`insert into payments (deal_id, amount_cents, due_at)
            select deal_id, ${(l.venda.valor - l.venda.pago) * 100}, ${brt(l.venda.saldoDia!, '12:00')}
            from payments where id = ${pays[0]!.id}`;
        }
      }
    }
    const [general] = await tx<
      { id: string }[]
    >`select id from chat_channels where kind = 'GENERAL'`;
    const [hasChat] = await tx`select 1 from chat_messages where channel_id = ${general!.id}`;
    if (!hasChat) {
      const send = async (
        channel: string,
        rows: [string, string, string | null][],
        hour: number,
      ) => {
        let minute = 0;
        for (const [who, body, lead] of rows) {
          minute += 7;
          await tx`insert into chat_messages (channel_id, author_id, body, lead_id, created_at)
            values (${channel}, ${users.get(who)!}, ${body}, ${lead ? (leadId.get(`mock-${lead}`) ?? null) : null},
              ${brt(0, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`)})`;
        }
      };
      await send(general!.id, CHAT_GERAL, 9);
      const [a, b] = [users.get('Ronaldo')!, users.get('Igor')!].sort() as [string, string];
      const [dm] = await tx<{ id: string }[]>`
        insert into chat_channels (kind, dm_key) values ('DM', ${`${a}|${b}`})
        on conflict (dm_key) do update set dm_key = excluded.dm_key returning id`;
      await tx`insert into chat_members (channel_id, user_id) values (${dm!.id}, ${a}), (${dm!.id}, ${b})
        on conflict do nothing`;
      await send(dm!.id, CHAT_DM, 10);
    }
  });
  console.log(
    `Protótipo carregado: ${report.leads.imported} leads, ${report.meetings.imported} reuniões, ${report.sales.imported} vendas` +
      (report.rejected.length ? `; rejeitados: ${JSON.stringify(report.rejected)}` : ''),
  );
} finally {
  await sql.end();
}
