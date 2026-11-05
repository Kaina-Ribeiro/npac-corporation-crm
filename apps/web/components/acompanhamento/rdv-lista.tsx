'use client';
import type { PaginaRdv, RdvItem } from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { baixarBackup } from '@/lib/acompanhamento-download';
import { clientApi } from '@/lib/client-api';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { EVENTO_MAIS } from './abas-mobile';
import { iniciais } from './fichas-lista';
import { ImportarGaveta } from './importar-gaveta';
import { CabecalhoModulo } from './cabecalho-modulo';

const BUSCA = '/api/mentoria/rdv/search';

/** Linha do tempo RDV (Módulo 3): pessoas ou casais A–Z, busca por POST, cadastro e .json. */
export function RdvLista({ inicial }: { inicial: PaginaRdv }) {
  const [itens, setItens] = useState<RdvItem[]>(inicial.itens);
  const [cursor, setCursor] = useState(inicial.cursor);
  const [total, setTotal] = useState(inicial.total ?? inicial.itens.length);
  const [q, setQ] = useState('');
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState(false);
  const [importar, setImportar] = useState(false);
  const primeira = useRef(true);
  const params = useSearchParams();
  const router = useRouter();

  // "+" do rodapé no celular abre Novo mentorado (também vindo da ficha, com ?novo=1).
  useEffect(() => {
    const abrir = () => setNovo(true);
    window.addEventListener(EVENTO_MAIS, abrir);
    if (params.get('novo') === '1') {
      setNovo(true);
      router.replace('/acompanhamento/rdv');
    }
    return () => window.removeEventListener(EVENTO_MAIS, abrir);
  }, [params, router]);

  const buscar = (termo: string, depois?: string) =>
    clientApi<PaginaRdv>(BUSCA, 'POST', {
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
      <CabecalhoModulo
        titulo="Linha do tempo RDV"
        descricao={`Tudo o que aconteceu com cada mentorado da trilha RDV, em ordem cronológica · ${total} ${total === 1 ? 'pessoa ou casal' : 'pessoas ou casais'}`}
        acoes={
          <>
            <button type="button" className={`${button}`} onClick={() => setNovo(true)}>
              Novo mentorado
            </button>
            <button type="button" className={`${quietButton}`} onClick={() => setImportar(true)}>
              Importar .json
            </button>
            <button
              type="button"
              className={`${quietButton}`}
              onClick={() => void baixarBackup('rdv').catch((e: Error) => setErro(e.message))}
            >
              Exportar .json
            </button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          aria-label="Buscar mentorados RDV"
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
          {itens.map((p) => (
            <li key={p.id}>
              <Link
                href={`/acompanhamento/rdv/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[0.03] active:bg-black/[0.05] dark:hover:bg-white/[0.04]"
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-9 flex-none items-center justify-center rounded-full bg-black/[0.06] text-xs font-bold text-ink2 dark:bg-white/10"
                >
                  {iniciais(p.nome)}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm font-semibold">{p.nome}</b>
                  <small className="block truncate text-xs text-ink2">
                    {p.eventos === 0
                      ? 'Nenhum evento ainda'
                      : `${p.eventos} ${p.eventos === 1 ? 'evento registrado' : 'eventos registrados'}`}
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
              ? 'Ninguém com esse nome na trilha RDV.'
              : 'Ninguém no RDV ainda. Use Novo mentorado ou Importar .json.'}
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

      {novo && <NovoMentorado onFechar={() => setNovo(false)} />}
      {importar && (
        <ImportarGaveta
          modulo="rdv"
          onClose={() => {
            setImportar(false);
            recarregar();
          }}
        />
      )}
    </div>
  );
}

/** Cadastro manual: só o nome. Diagnóstico, pasta e eventos se colam depois, na ficha. */
function NovoMentorado({ onFechar }: { onFechar: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [nome, setNome] = useState('');
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
      const r = await clientApi<{ id: string }>('/api/mentoria/rdv', 'POST', { nome });
      router.push(`/acompanhamento/rdv/${r.id}`);
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
            Novo mentorado
          </h2>
          <p className="mt-1 text-sm text-ink2">
            Diagnóstico, link da pasta e eventos você cola depois, na ficha. Nenhum evento é criado
            sozinho.
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
        <FormError message={erro} />
        <div className="flex justify-end gap-2">
          <button type="button" className={quietButton} onClick={() => ref.current?.close()}>
            Cancelar
          </button>
          <button type="submit" className={button} disabled={ocupado}>
            Criar
          </button>
        </div>
      </form>
    </dialog>
  );
}
