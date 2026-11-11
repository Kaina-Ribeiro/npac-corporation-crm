import type { AgendaSemana, Condutor, ControleMensal, SemReuniao } from '@npac/shared/mentoria';
import Link from 'next/link';
import { ControleMensalTela } from '@/components/acompanhamento/controle-mensal';
import { ReunioesAgenda } from '@/components/acompanhamento/reunioes-agenda';
import { SemReuniaoTela } from '@/components/acompanhamento/sem-reuniao';
import { lerEu, sessaoDoModulo } from '@/lib/acompanhamento';
import { apiGet, apiPost } from '@/lib/api';

export const metadata = { title: 'Reuniões' };

const ABAS = [
  ['agenda', 'Agenda'],
  ['controle', 'Controle mensal'],
  ['sem', 'Sem reunião'],
] as const;

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
  if (!(await sessaoDoModulo())) return null;
  const q = await searchParams;
  const aba = ABAS.some(([id]) => id === q.aba) ? q.aba! : 'agenda';
  const eu = await lerEu();
  // A Especialista também agenda as próprias reuniões (a API recusa as que não são dela).
  const podeAgendar = !!eu && (eu.admin || eu.perfil !== 'MENTOR');
  return (
    <section className="view">
      <div>
        <h1 className="h1">Reuniões</h1>
        <p className="sub">Agenda da semana, quem já teve a reunião do mês e quem está sem.</p>
      </div>
      <div className="tabs">
        {ABAS.map(([id, rotulo]) => (
          <Link
            key={id}
            className={aba === id ? 'on' : ''}
            href={`/acompanhamento/reunioes?aba=${id}`}
          >
            {rotulo}
          </Link>
        ))}
      </div>
      <Conteudo aba={aba} q={q} podeAgendar={podeAgendar} />
    </section>
  );
}
