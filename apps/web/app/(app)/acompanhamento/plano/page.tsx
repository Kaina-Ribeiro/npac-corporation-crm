import type { PaginaAcoes, PaginaInscricoes, PlanoSemana as Semana } from '@npac/shared/mentoria';
import Link from 'next/link';
import { PlanoMentorados, PlanoMes, PlanoSemana } from '@/components/acompanhamento/plano-semana';
import { ExportarBotao } from '@/components/acompanhamento/exportar-botao';
import { LembrarUrl } from '@/components/acompanhamento/lembrar-url';
import { lerEu, podeExportar, sessaoDoModulo } from '@/lib/acompanhamento';
import { abasLembradas } from '@/lib/acompanhamento-abas';
import { apiPost } from '@/lib/api';

export const metadata = { title: 'Plano dos 12 meses' };

const ABAS = [
  ['semana', 'Esta semana'],
  ['mes', 'Por mês'],
  ['mentorados', 'Por mentorado'],
] as const;
const IDS = ABAS.map(([id]) => id);
/** Aba e mês da jornada lembrados (NPAC-46). */
const CHAVES = { semana: [], mes: ['mes'], mentorados: [] };

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
  const me = await sessaoDoModulo();
  if (!me) return null;
  const lembradas = await abasLembradas('plano', me.id, await searchParams, {
    abas: IDS,
    padrao: 'semana',
    chaves: CHAVES,
  });
  const { aba, q } = lembradas;
  const n = Number(q.mes);
  const mes = Number.isInteger(n) && n >= 1 && n <= 13 ? n : 1;
  return (
    <section className="view">
      <div className="hrow">
        <div>
          <h1 className="h1">Plano dos 12 meses</h1>
          <p className="sub">A ação de cada mês: o que vence, quem faz e o que já foi feito.</p>
        </div>
        {podeExportar(await lerEu()) && (
          <div className="acts so-desk">
            <ExportarBotao aba="PLANO" />
          </div>
        )}
      </div>
      <div className="tabs">
        {ABAS.map(([id, rotulo]) => (
          <Link key={id} className={aba === id ? 'on' : ''} href={lembradas.href(id)}>
            {rotulo}
          </Link>
        ))}
      </div>
      <Conteudo aba={aba} mes={mes} />
      <LembrarUrl
        screen="plano"
        cookie={lembradas.cookie}
        valor={lembradas.valor}
        abas={IDS}
        aba={aba}
        consulta={lembradas.consulta}
        doMenu={lembradas.doMenu}
      />
    </section>
  );
}
