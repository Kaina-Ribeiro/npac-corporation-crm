'use client';
import {
  MENTORADO_STATUS_LABEL,
  type MentoradoItem,
  type PaginaMentorados,
} from '@npac/shared/mentoria';
import { useEffect, useRef, useState } from 'react';
import { clientApi } from '@/lib/client-api';
import { FormError, quietButton } from '@/components/crm-ui';

const BUSCA = '/api/mentoria/mentorados/search';

/** Cor do status (lista fixa do PDF): a mesma na etiqueta e, no 14B, na linha. */
export const STATUS_CLS: Record<MentoradoItem['status'], string> = {
  ENGAJADO: 'bg-emerald-500/12 text-emerald-800 dark:text-emerald-300',
  EM_ATENCAO: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  EM_RISCO: 'bg-rose-500/12 text-rose-800 dark:text-rose-300',
};

/**
 * Dashboard do Acompanhamento: tabela A–Z com busca por nome (sem acento) e "Carregar mais".
 * Termo e cursor vão no corpo do POST, nunca na URL.
 */
export function DashboardView({ inicial }: { inicial: PaginaMentorados }) {
  const [itens, setItens] = useState(inicial.itens);
  const [cursor, setCursor] = useState(inicial.cursor);
  const [q, setQ] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const primeira = useRef(true);

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    let velho = false;
    const t = setTimeout(() => {
      void clientApi<PaginaMentorados>(BUSCA, 'POST', q.trim() ? { q: q.trim() } : {})
        .then((r) => {
          if (velho) return;
          setItens(r.itens);
          setCursor(r.cursor);
        })
        .catch((e: Error) => !velho && setErro(e.message));
    }, 200);
    return () => {
      velho = true;
      clearTimeout(t);
    };
  }, [q]);

  async function carregarMais() {
    if (!cursor) return;
    setCarregando(true);
    try {
      const r = await clientApi<PaginaMentorados>(BUSCA, 'POST', {
        ...(q.trim() ? { q: q.trim() } : {}),
        cursor,
      });
      setItens((a) => [...a, ...r.itens]);
      setCursor(r.cursor);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[28px] font-bold tracking-[-0.03em]">Dashboard</h1>
        <p className="mt-1 text-sm text-ink2">
          Lista geral de todos os mentorados com o status de engajamento de cada um
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative w-full max-w-sm">
          <svg
            viewBox="0 0 24 24"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            aria-label="Buscar mentorados"
            placeholder="Buscar por nome"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="field w-full pl-9 text-ink dark:!bg-white/10"
          />
        </label>
      </div>

      <FormError message={erro} />

      <section className="glass-card min-w-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table aria-label="Mentorados" className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs text-ink3">
              <tr className="border-b border-line">
                <th className="px-4 py-3 font-semibold">Nome</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Tipo de mentoria</th>
                <th className="px-4 py-3 font-semibold">Data de entrada</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {itens.map((m) => (
                <tr
                  key={m.id}
                  className="transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.03]"
                >
                  <td className="px-4 py-3 font-semibold">{m.nome}</td>
                  <td className="px-4 py-3 text-ink2">{m.tipoCadastro ?? '—'}</td>
                  <td className="px-4 py-3 text-ink2">{m.tipoMentoria ?? '—'}</td>
                  <td className="px-4 py-3 text-ink2">{m.dataEntradaTexto ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLS[m.status]}`}
                    >
                      {MENTORADO_STATUS_LABEL[m.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {itens.length === 0 && (
          <p className="px-4 py-6 text-sm text-ink2">
            {q.trim()
              ? 'Ninguém com esse nome.'
              : 'Nenhum mentorado ainda. Importe a planilha ou o .json na aba Importação e backup.'}
          </p>
        )}
        {cursor && (
          <div className="border-t border-line p-3">
            <button
              type="button"
              className={`${quietButton} active:scale-[.98]`}
              disabled={carregando}
              onClick={() => void carregarMais()}
            >
              Carregar mais
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
