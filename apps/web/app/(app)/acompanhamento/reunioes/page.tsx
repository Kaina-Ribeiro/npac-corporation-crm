import type { AgendaSemana, Condutor, ControleMensal, SemReuniao } from '@npac/shared/mentoria';
import Link from 'next/link';
import { ControleMensalTela } from '@/components/acompanhamento/controle-mensal';
import { ExportarBotao } from '@/components/acompanhamento/exportar-botao';
import { LembrarUrl } from '@/components/acompanhamento/lembrar-url';
import { ReunioesAgenda } from '@/components/acompanhamento/reunioes-agenda';
import { SemReuniaoTela } from '@/components/acompanhamento/sem-reuniao';
import { lerEu, podeExportar, sessaoDoModulo } from '@/lib/acompanhamento';
import { abasLembradas } from '@/lib/acompanhamento-abas';
import { apiGet, apiPost } from '@/lib/api';

export const metadata = { title: 'Reuniões' };

const ABAS = [
  ['agenda', 'Agenda'],
  ['controle', 'Controle mensal'],
  ['sem', 'Sem reunião'],
] as const;

/** Filtros de cada aba, lembrados (NPAC-46); semana e mês só no mesmo dia. */
const CHAVES = { agenda: ['dia', 'condutor'], controle: ['mes', 'mentoria'], sem: ['mentoria'] };
const DIARIAS = ['dia', 'mes'];

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const MENTORIA = /^(RDV|2M|6M)$/;

type Busca = { aba?: string; dia?: string; condutor?: string; mes?: string; mentoria?: string };

async function Conteudo({ aba, q, podeAgendar }: { aba: string; q: Busca; podeAgendar: boolean }) {
  const mentoria = q.mentoria && MENTORIA.test(q.mentoria) ? q.mentoria : '';
  if (aba === 'controle') {
    const dados = await apiPost<ControleMensal>('/api/mentoria/reunioes/controle-mensal', {
      ...(q.mes && MES.test(q.mes) ? { mes: q.mes } : {}),
      ...(mentoria ? { mentoria } : {}),
    });
    return <ControleMensalTela dados={dados} mentoria={mentoria} podeAgendar={podeAgendar} />;
  }
  if (aba === 'sem') {
    const dados = await apiPost<SemReuniao>(
      '/api/mentoria/reunioes/sem-reuniao',
      mentoria ? { mentoria } : {},
    );
    return <SemReuniaoTela dados={dados} mentoria={mentoria} podeAgendar={podeAgendar} />;
  }
  const condutor = q.condutor && /^[\w-]{1,100}$/.test(q.condutor) ? q.condutor : '';
  const [dados, condutores] = await Promise.all([
    apiPost<AgendaSemana>('/api/mentoria/reunioes/agenda', {
      ...(q.dia && DIA.test(q.dia) ? { dia: q.dia } : {}),
      ...(condutor ? { condutorId: condutor } : {}),
    }),
    apiGet<Condutor[]>('/api/mentoria/reunioes/condutores'),
  ]);
  // No filtro, só quem conduz alguma reunião (ou o escolhido): a lista de usuários é longa.
  const comReuniao = condutores.filter(
    (c) =>
      c.perfil !== null ||
      c.id === condutor ||
      dados.reunioes.some((r) => r.conduzidaPor?.id === c.id),
  );
  return (
    <ReunioesAgenda
      dados={dados}
      condutores={comReuniao}
      condutorId={condutor}
      podeAgendar={podeAgendar}
    />
  );
}

export default async function ReunioesPage({ searchParams }: { searchParams: Promise<Busca> }) {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const url = await searchParams;
  const eu = await lerEu();
  // A Especialista também agenda as próprias reuniões (a API recusa as que não são dela).
  const podeAgendar = !!eu && (eu.admin || eu.perfil !== 'MENTOR');
  // Controle mensal e Sem reunião são painéis da equipe: a Especialista só vê as reuniões dela.
  const equipe = !!eu && (eu.admin || eu.perfil === 'ACOMPANHAMENTO' || eu.perfil === 'OPERACAO');
  const abas = equipe ? ABAS : ABAS.filter(([id]) => id === 'agenda');
  const ids = abas.map(([id]) => id);
  const lembradas = await abasLembradas('reunioes', me.id, url, {
    abas: ids,
    padrao: 'agenda',
    chaves: CHAVES,
    daily: DIARIAS,
  });
  const { aba, q } = lembradas;
  return (
    <section className="view">
      <div className="hrow">
        <div>
          <h1 className="h1">Reuniões</h1>
          <p className="sub">Agenda da semana, quem já teve a reunião do mês e quem está sem.</p>
        </div>
        {podeExportar(eu) && (
          <div className="acts so-desk">
            <ExportarBotao aba="REUNIOES" />
          </div>
        )}
      </div>
      <div className="tabs">
        {abas.map(([id, rotulo]) => (
          <Link key={id} className={aba === id ? 'on' : ''} href={lembradas.href(id)}>
            {rotulo}
          </Link>
        ))}
      </div>
      <Conteudo aba={aba} q={q} podeAgendar={podeAgendar} />
      <LembrarUrl
        screen="reunioes"
        cookie={lembradas.cookie}
        valor={lembradas.valor}
        abas={ids}
        aba={aba}
        consulta={lembradas.consulta}
        daily={DIARIAS}
        doMenu={lembradas.doMenu}
      />
    </section>
  );
}
