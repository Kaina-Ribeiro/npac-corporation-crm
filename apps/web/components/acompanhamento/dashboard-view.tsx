'use client';
import {
  MENTORADO_STATUS_LABEL,
  type MentoradoItem,
  type MentoradoStatus,
  type PaginaMentorados,
  type ResumoDashboard,
} from '@npac/shared/mentoria';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { baixarBackup } from '@/lib/acompanhamento-download';
import { useFieldSaver } from '@/lib/acompanhamento-saver';
import { clientApi } from '@/lib/client-api';
import { FormError, button, ghostButton, quietButton } from '@/components/crm-ui';
import { EVENTO_MAIS } from './abas-mobile';
import { DashboardCards } from './dashboard-cards';
import { ImportarGaveta } from './importar-gaveta';
import { MentoradoLinha } from './mentorado-linha';
import { RemoverConfirma } from './remover-confirma';
import { CabecalhoModulo } from './cabecalho-modulo';

const BUSCA = '/api/mentoria/mentorados/search';

type Filtros = { q: string; status: MentoradoStatus | null; tipoMentoria: string | null };
const corpo = (f: Filtros, cursor?: string) => ({
  ...(f.q.trim() ? { q: f.q.trim() } : {}),
  ...(f.status ? { status: f.status } : {}),
  ...(f.tipoMentoria ? { tipoMentoria: f.tipoMentoria } : {}),
  ...(cursor ? { cursor } : {}),
});

const icone = (d: string) => (
  <svg
    viewBox="0 0 24 24"
    className="size-4"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);

/**
 * Dashboard do Acompanhamento (Módulo 1): cards por status com os nomes, etiquetas por tipo de
 * mentoria, busca por nome (POST) e tabela A–Z com edição na célula. Filtros, termo e cursor vão
 * no corpo do POST, nunca na URL. Nada recarrega sozinho com fila pendente (D24).
 */
export function DashboardView({ inicial }: { inicial: ResumoDashboard }) {
  const saver = useFieldSaver();
  const [resumo, setResumo] = useState(inicial);
  const [itens, setItens] = useState(inicial.itens);
  const [cursor, setCursor] = useState(inicial.cursor);
  const [f, setF] = useState<Filtros>({ q: '', status: null, tipoMentoria: null });
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [gaveta, setGaveta] = useState<'planilha' | 'json' | null>(null);
  const [remover, setRemover] = useState<MentoradoItem | null>(null);
  const primeira = useRef(true);
  const params = useSearchParams();
  const router = useRouter();

  // "+" do rodapé no celular: Colar planilha (também quando vem do "Mais", com ?colar=1).
  useEffect(() => {
    const abrir = () => setGaveta('planilha');
    window.addEventListener(EVENTO_MAIS, abrir);
    if (params.get('colar') === '1') {
      setGaveta('planilha');
      router.replace('/acompanhamento/dashboard');
    }
    return () => window.removeEventListener(EVENTO_MAIS, abrir);
  }, [params, router]);

  useEffect(() => {
    for (const m of itens) saver.registrar(`mentorado:${m.id}`, m.version);
  }, [itens]);

  const recarregar = (filtros: Filtros) =>
    clientApi<ResumoDashboard>(BUSCA, 'POST', corpo(filtros)).then((r) => {
      setResumo(r);
      setItens(r.itens);
      setCursor(r.cursor);
    });

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    let velho = false;
    const t = setTimeout(() => {
      void clientApi<ResumoDashboard>(BUSCA, 'POST', corpo(f))
        .then((r) => {
          if (velho) return;
          setResumo(r);
          setItens(r.itens);
          setCursor(r.cursor);
        })
        .catch((e: Error) => !velho && setErro(e.message));
    }, 200);
    return () => {
      velho = true;
      clearTimeout(t);
    };
  }, [f]);

  async function carregarMais() {
    if (!cursor) return;
    setCarregando(true);
    try {
      const r = await clientApi<PaginaMentorados>(BUSCA, 'POST', corpo(f, cursor));
      setItens((a) => [...a, ...r.itens]);
      setCursor(r.cursor);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }

  /** Salva pela fila e reflete na tela já (cor da linha, cards). */
  function salvar(m: MentoradoItem, campo: string, valor: string | null) {
    saver.salvar(`mentorado:${m.id}`, campo, valor);
    setItens((lista) =>
      lista.map((x) =>
        x.id !== m.id
          ? x
          : {
              ...x,
              ...(campo === 'nome' && { nome: valor ?? x.nome }),
              ...(campo === 'tipoCadastro' && { tipoCadastro: valor }),
              ...(campo === 'tipoMentoria' && { tipoMentoria: valor }),
              ...(campo === 'dataEntrada' && { dataEntradaTexto: valor }),
              ...(campo === 'status' && { status: valor as MentoradoStatus }),
            },
      ),
    );
    if (campo === 'status' && valor && valor !== m.status) {
      setResumo((r) => {
        const de = m.status;
        const para = valor as MentoradoStatus;
        const quem = r.nomesPorStatus[de].find((x) => x.id === m.id) ?? { id: m.id, nome: m.nome };
        return {
          ...r,
          contagemPorStatus: {
            ...r.contagemPorStatus,
            [de]: r.contagemPorStatus[de] - 1,
            [para]: r.contagemPorStatus[para] + 1,
          },
          nomesPorStatus: {
            ...r.nomesPorStatus,
            [de]: r.nomesPorStatus[de].filter((x) => x.id !== m.id),
            [para]: [...r.nomesPorStatus[para], quem].sort((a, b) =>
              a.nome.localeCompare(b.nome, 'pt-BR'),
            ),
          },
        };
      });
    }
  }

  const titulo =
    (f.status ? MENTORADO_STATUS_LABEL[f.status] : 'Todos os mentorados') +
    (f.tipoMentoria ? ` · ${f.tipoMentoria}` : '');
  const totalBase = Object.values(resumo.contagemPorStatus).reduce((a, b) => a + b, 0);
  const temFiltro = !!(f.q.trim() || f.status || f.tipoMentoria);

  const vazio = totalBase === 0;
  const icColar = icone('M5 4h14v16H5zM9 4V2h6v2M9 10h6M9 14h6');
  const icImportar = icone('M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2');

  return (
    <div className="flex flex-col gap-5">
      {/* Com a base vazia, as ações ficam só no convite (sem botão repetido). */}
      <CabecalhoModulo
        titulo="Dashboard"
        descricao={`Lista geral de todos os mentorados com o status de engajamento de cada um · ${
          totalBase === 1 ? '1 cadastrado' : `${totalBase} cadastrados`
        }`}
        acoes={
          vazio ? undefined : (
            <>
              <button type="button" className={ghostButton} onClick={() => setGaveta('json')}>
                {icImportar}Importar .json
              </button>
              <button
                type="button"
                className={ghostButton}
                onClick={() =>
                  void baixarBackup('dashboard').catch((e: Error) => setErro(e.message))
                }
              >
                {icone('M12 15V3M7 8l5-5 5 5M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2')}Exportar
                .json
              </button>
              <button type="button" className={button} onClick={() => setGaveta('planilha')}>
                {icColar}Colar planilha
              </button>
            </>
          )
        }
      />

      {vazio ? (
        <section
          aria-labelledby="vazio-titulo"
          className="flex flex-col items-center gap-4 rounded-[20px] border border-dashed border-line px-6 py-14 text-center"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-12 items-center justify-center rounded-2xl bg-black/[0.05] text-ink2 dark:bg-white/[0.08]"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7" />
            </svg>
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="vazio-titulo" className="text-lg font-semibold tracking-[-0.01em]">
              Comece trazendo seus mentorados
            </h2>
            <p className="text-sm text-ink2">Cole a planilha ou importe um backup .json.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className={quietButton} onClick={() => setGaveta('json')}>
              {icImportar}Importar .json
            </button>
            <button type="button" className={button} onClick={() => setGaveta('planilha')}>
              {icColar}Colar planilha
            </button>
          </div>
        </section>
      ) : (
        <>
          <DashboardCards
            contagem={resumo.contagemPorStatus}
            nomes={resumo.nomesPorStatus}
            filtro={f.status}
            onFiltro={(status) => setF((x) => ({ ...x, status }))}
          />

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative w-full max-w-sm">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink3">
                {icone('M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5')}
              </span>
              <input
                type="search"
                aria-label="Buscar mentorados"
                placeholder="Buscar por nome"
                value={f.q}
                onChange={(e) => setF((x) => ({ ...x, q: e.target.value }))}
                className="field w-full pl-9 text-ink dark:!bg-white/10"
              />
            </label>
            {resumo.contagemPorMentoria.length > 0 && (
              <span className="text-xs text-ink3">Tipo de mentoria:</span>
            )}
            {resumo.contagemPorMentoria.map((t) => {
              const on = f.tipoMentoria === t.nome;
              return (
                <button
                  key={t.nome}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setF((x) => ({ ...x, tipoMentoria: on ? null : t.nome }))}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] active:scale-[.98] ${
                    on
                      ? 'border-line bg-[var(--on)] font-semibold text-ink shadow-sm'
                      : 'border-dashed border-line text-ink2 hover:text-ink'
                  }`}
                >
                  {t.nome}
                  <span className="rounded-full bg-black/[0.06] px-1.5 text-[11.5px] text-ink2 dark:bg-white/10">
                    {t.n}
                  </span>
                </button>
              );
            })}
            {temFiltro && (
              <button
                type="button"
                className="h-8 rounded-lg px-2.5 text-xs font-semibold text-ink2 hover:text-ink"
                onClick={() => setF({ q: '', status: null, tipoMentoria: null })}
              >
                Limpar filtros
              </button>
            )}
          </div>

          <FormError message={erro} />

          <section className="glass-card min-w-0 overflow-hidden" aria-labelledby="lista-titulo">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4 pb-2">
              <h2 id="lista-titulo" className="text-base font-semibold">
                {titulo}{' '}
                <span className="text-xs font-normal text-ink3">
                  {itens.length} de {resumo.total}
                </span>
              </h2>
              <span className="text-xs text-ink3">
                Edite direto na célula · salva ao sair do campo · a cor da linha segue o status
              </span>
            </div>
            <datalist id="mentorias">
              {resumo.contagemPorMentoria.map((t) => (
                <option key={t.nome} value={t.nome} />
              ))}
            </datalist>
            <div className="overflow-x-auto">
              <table aria-label="Mentorados" className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-xs text-ink3">
                  <tr className="border-y border-line">
                    <th className="w-[30%] px-4 py-2.5 font-semibold">Nome</th>
                    <th className="px-4 py-2.5 font-semibold">Tipo</th>
                    <th className="px-4 py-2.5 font-semibold">Tipo de mentoria</th>
                    <th className="px-4 py-2.5 font-semibold">Data de entrada</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {itens.map((m) => (
                    <MentoradoLinha
                      key={m.id}
                      m={m}
                      onSalvar={(campo, valor) => salvar(m, campo, valor)}
                      onRemover={() => setRemover(m)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {itens.length === 0 && (
              <p className="px-4 py-6 text-sm text-ink2">Ninguém com esses filtros.</p>
            )}
            {cursor && (
              <div className="border-t border-line p-3">
                <button
                  type="button"
                  className={`${quietButton}`}
                  disabled={carregando}
                  onClick={() => void carregarMais()}
                >
                  Carregar mais
                </button>
              </div>
            )}
          </section>
        </>
      )}

      {gaveta && (
        <ImportarGaveta
          modulo="dashboard"
          modoInicial={gaveta}
          onClose={() => {
            setGaveta(null);
            if (!saver.pendentes) void recarregar(f).catch(() => {});
          }}
        />
      )}
      {remover && (
        <RemoverConfirma
          kind="mentorado"
          id={remover.id}
          version={saver.versionDe(`mentorado:${remover.id}`) ?? remover.version}
          titulo={`Remover ${remover.nome}?`}
          texto="O mentorado sai do Dashboard."
          onFechar={() => setRemover(null)}
          onFeito={() => void recarregar(f).catch(() => {})}
        />
      )}
    </div>
  );
}
