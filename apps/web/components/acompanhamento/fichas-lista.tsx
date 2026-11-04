'use client';
import type { FichaItem, PaginaFichas } from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { baixarBackup } from '@/lib/acompanhamento-download';
import { clientApi } from '@/lib/client-api';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { EVENTO_MAIS } from './abas-mobile';
import { ImportarGaveta } from './importar-gaveta';

const BUSCA = '/api/mentoria/fichas/search';

export const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter((p) => /^\p{L}/u.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/** Linha do tempo (Módulo 2): lista de fichas A–Z, busca por POST, cadastro manual e .json. */
export function FichasLista({ inicial }: { inicial: PaginaFichas }) {
  const [itens, setItens] = useState<FichaItem[]>(inicial.itens);
  const [cursor, setCursor] = useState(inicial.cursor);
  const [total, setTotal] = useState(inicial.total ?? inicial.itens.length);
  const [q, setQ] = useState('');
  const [erro, setErro] = useState('');
  const [nova, setNova] = useState(false);
  const [importar, setImportar] = useState(false);
  const primeira = useRef(true);
  const params = useSearchParams();
  const router = useRouter();

  // "+" do rodapé no celular: Nova ficha (também quando vem da ficha, com ?nova=1).
  useEffect(() => {
    const abrir = () => setNova(true);
    window.addEventListener(EVENTO_MAIS, abrir);
    if (params.get('nova') === '1') {
      setNova(true);
      router.replace('/acompanhamento/linha-do-tempo');
    }
    return () => window.removeEventListener(EVENTO_MAIS, abrir);
  }, [params, router]);

  const buscar = (termo: string, depois?: string) =>
    clientApi<PaginaFichas>(BUSCA, 'POST', {
      ...(termo.trim() ? { q: termo.trim() } : {}),
      ...(depois ? { cursor: depois } : {}),
    });

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    let velho = false;
    const t = setTimeout(() => {
      void buscar(q)
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

  const recarregar = () =>
    void buscar(q)
      .then((r) => {
        setItens(r.itens);
        setCursor(r.cursor);
        setTotal(r.total ?? r.itens.length);
      })
      .catch(() => {});

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-[-0.03em]">Linha do tempo</h1>
          <p className="mt-1 text-sm text-ink2">
            Ficha de evolução antes e depois de cada mentorado · {total} fichas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${button} active:scale-[.98]`}
            onClick={() => setNova(true)}
          >
            Nova ficha
          </button>
          <button
            type="button"
            className={`${quietButton} active:scale-[.98]`}
            onClick={() => setImportar(true)}
          >
            Importar .json
          </button>
          <button
            type="button"
            className={`${quietButton} active:scale-[.98]`}
            onClick={() =>
              void baixarBackup('linha-do-tempo').catch((e: Error) => setErro(e.message))
            }
          >
            Exportar .json
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Buscar fichas"
          placeholder="Buscar por nome"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="field w-full max-w-sm text-ink dark:!bg-white/10"
        />
        <span className="text-xs text-ink3">
          {itens.length} de {total}
        </span>
      </div>
      <FormError message={erro} />

      <section className="glass-card min-w-0 overflow-hidden">
        <ul className="divide-y divide-line">
          {itens.map((f) => (
            <li key={f.id}>
              <Link
                href={`/acompanhamento/linha-do-tempo/${f.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[0.03] active:bg-black/[0.05] dark:hover:bg-white/[0.04]"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-black/[0.06] text-xs font-bold text-ink2 dark:bg-white/10"
                >
                  {iniciais(f.nome)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm font-semibold">{f.nome}</b>
                  <small className="block truncate text-xs text-ink2">
                    Início {f.dataInicioTexto ?? '—'} · {f.tempoMentoria ?? 'tempo não informado'} ·{' '}
                    {f.conquistas} {f.conquistas === 1 ? 'conquista' : 'conquistas'}
                  </small>
                </span>
                <svg
                  viewBox="0 0 24 24"
                  className="size-4 flex-none text-ink3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
        {itens.length === 0 && (
          <p className="px-4 py-6 text-sm text-ink2">
            {q.trim()
              ? 'Nenhuma ficha com esse nome.'
              : 'Nenhuma ficha ainda. Use Nova ficha ou Importar .json.'}
          </p>
        )}
        {cursor && (
          <div className="border-t border-line p-3">
            <button
              type="button"
              className={quietButton}
              onClick={() =>
                void buscar(q, cursor).then((r) => {
                  setItens((a) => [...a, ...r.itens]);
                  setCursor(r.cursor);
                })
              }
            >
              Carregar mais
            </button>
          </div>
        )}
      </section>

      {nova && <NovaFicha onFechar={() => setNova(false)} />}
      {importar && (
        <ImportarGaveta
          modulo="linha-do-tempo"
          onClose={() => {
            setImportar(false);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

/** Cadastro manual: nome e data de início; depois abre a ficha para preencher o resto. */
function NovaFicha({ onFechar }: { onFechar: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [nome, setNome] = useState('');
  const [data, setData] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function criar() {
    setErro('');
    if (!nome.trim()) return setErro('Informe o nome');
    setOcupado(true);
    try {
      const r = await clientApi<{ id: string }>('/api/mentoria/fichas', 'POST', {
        nome,
        dataInicio: data,
      });
      router.push(`/acompanhamento/linha-do-tempo/${r.id}`);
    } catch (e) {
      setErro((e as Error).message);
      setOcupado(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onFechar}
      className="m-auto w-[min(460px,calc(100vw-32px))] rounded-3xl bg-[var(--bg)] p-0 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,.45)] backdrop:bg-black/30"
    >
      <form
        className="flex flex-col gap-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void criar();
        }}
      >
        <div>
          <h2 id={id} className="text-lg font-bold tracking-[-0.02em]">
            Nova ficha
          </h2>
          <p className="mt-1 text-sm text-ink2">
            Cadastro manual. As demais caixas você preenche na ficha.
          </p>
        </div>
        <label className="flex flex-col gap-2 text-sm font-semibold text-ink2">
          Nome do mentorado ou casal
          <input
            className={control}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-semibold text-ink2">
          Data de início
          <input
            className={control}
            value={data}
            onChange={(e) => setData(e.target.value)}
            placeholder="DD/MM/AAAA"
          />
        </label>
        <FormError message={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className={quietButton} onClick={() => ref.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className={button} disabled={ocupado}>
            Criar ficha
          </button>
        </div>
      </form>
    </dialog>
  );
}
