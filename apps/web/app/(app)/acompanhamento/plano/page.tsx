import type { PaginaAcoes, PaginaInscricoes, PlanoSemana as Semana } from '@npac/shared/mentoria';
import Link from 'next/link';
import { PlanoMentorados, PlanoMes, PlanoSemana } from '@/components/acompanhamento/plano-semana';
import { sessaoDoModulo } from '@/lib/acompanhamento';
import { apiPost } from '@/lib/api';

export const metadata = { title: 'Plano dos 12 meses' };

const ABAS = [
  ['semana', 'Esta semana'],
  ['mes', 'Por mês'],
  ['mentorados', 'Por mentorado'],
] as const;

async function Conteudo({ aba, mes }: { aba: string; mes: number }) {
  if (aba === 'mes') {
    const inicial = await apiPost<PaginaAcoes>('/api/mentoria/plano/lista', { mes });
    return <PlanoMes key={mes} mes={mes} inicial={inicial} />;
  }
  if (aba === 'mentorados') {
    const inicial = await apiPost<PaginaInscricoes>('/api/mentoria/inscricoes/lista', {
      status: 'ATIVO',
    });
    return <PlanoMentorados inicial={inicial} />;
  }
  return <PlanoSemana dados={await apiPost<Semana>('/api/mentoria/plano/semana', {})} />;
}

export default async function PlanoPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; mes?: string }>;
}) {
  if (!(await sessaoDoModulo())) return null;
  const q = await searchParams;
  const aba = ABAS.some(([id]) => id === q.aba) ? q.aba! : 'semana';
  const n = Number(q.mes);
  const mes = Number.isInteger(n) && n >= 1 && n <= 13 ? n : 1;
  return (
    <section className="view">
      <div>
        <h1 className="h1">Plano dos 12 meses</h1>
        <p className="sub">A ação de cada mês: o que vence, quem faz e o que já foi feito.</p>
      </div>
      <div className="tabs">
        {ABAS.map(([id, rotulo]) => (
          <Link
            key={id}
            className={aba === id ? 'on' : ''}
            href={`/acompanhamento/plano?aba=${id}`}
          >
            {rotulo}
          </Link>
        ))}
      </div>
      <Conteudo aba={aba} mes={mes} />
    </section>
  );
}
