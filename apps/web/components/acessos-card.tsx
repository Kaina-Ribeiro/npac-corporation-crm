'use client';
import { fraseAcesso, quandoAcesso, type Acesso } from '@npac/shared/acessos';
import { useEffect, useId, useRef, useState } from 'react';
import { clientApi } from '@/lib/client-api';
import { closeWithMotion } from '@/lib/dialog-motion';
import { savePreference } from '@/lib/user-cookie';
import { FormError, quietButton } from './crm-ui';

export type AcessosPagina = { items: Acesso[]; page: number; hasMore: boolean; total: number };

/** Linha do registro: data, frase com o nome em destaque e "novo" à direita. */
function Linha({ a, euId, agora, novo }: { a: Acesso; euId: string; agora: Date; novo: boolean }) {
  const f = fraseAcesso(a, euId);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 py-2.5 sm:grid-cols-[92px_minmax(0,1fr)_auto]">
      <span className="text-xs text-ink2 tabular-nums">{quandoAcesso(a.at, agora)}</span>
      <span className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:col-start-2 sm:row-start-1">
        {f.antes}
        {f.alvo && <b className="font-semibold">{f.alvo}</b>}
        {f.depois}
      </span>
      <span className="col-start-2 row-start-1 justify-self-end sm:col-start-3">
        {novo && (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-gold-text">
            <i aria-hidden="true" className="size-1.5 rounded-full bg-gold-deep" />
            novo
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * Quadro "Acessos" (NPAC-54, D10/D11; opção 2A aprovada em 19/11): o que mudou em contas e acessos,
 * só para a Diretoria, no topo de Admin → Usuários. "novo" = depois da última vez que esta pessoa
 * abriu o quadro neste aparelho (cookie só com o número da última linha vista, Path=/admin).
 */
export function AcessosCard({
  inicial,
  euId,
  vistoAte,
  cookie,
  agora,
}: {
  inicial: AcessosPagina;
  euId: string;
  /** Maior id visto antes desta abertura (0 = nunca abriu). */
  vistoAte: number;
  cookie: string;
  agora: string;
}) {
  const [verTudo, setVerTudo] = useState(false);
  const hora = new Date(agora);
  const linhas = inicial.items.slice(0, 5);

  // Abriu: o que está na tela deixa de ser "novo" na próxima vez.
  useEffect(() => {
    const maior = inicial.items[0]?.id ?? 0;
    if (maior > vistoAte) savePreference(cookie, String(maior), '/admin');
  }, [inicial, vistoAte, cookie]);

  return (
    <section aria-labelledby="acessos" className="glass-card flex min-w-0 flex-col gap-1 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 id="acessos" className="text-lg font-bold tracking-[-0.03em]">
          Acessos
        </h2>
        {inicial.total > 0 && (
          <button type="button" className={quietButton} onClick={() => setVerTudo(true)}>
            Ver tudo
          </button>
        )}
      </div>
      {linhas.length === 0 ? (
        <p className="py-2 text-sm text-ink2">Nada por aqui ainda.</p>
      ) : (
        <ol className="divide-y divide-line text-sm" aria-label="Últimos acessos">
          {linhas.map((a) => (
            <Linha key={a.id} a={a} euId={euId} agora={hora} novo={a.id > vistoAte} />
          ))}
        </ol>
      )}
      {verTudo && (
        <VerTudo euId={euId} vistoAte={vistoAte} agora={hora} onClose={() => setVerTudo(false)} />
      )}
    </section>
  );
}

/** Janelinha com o registro inteiro, 20 por página. */
function VerTudo({
  euId,
  vistoAte,
  agora,
  onClose,
}: {
  euId: string;
  vistoAte: number;
  agora: Date;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [pagina, setPagina] = useState<AcessosPagina | null>(null);
  const [erro, setErro] = useState<string>();

  async function abrir(page: number) {
    setErro(undefined);
    try {
      setPagina(await clientApi<AcessosPagina>(`/api/admin/acessos?page=${page}`));
    } catch (e) {
      setErro((e as Error).message);
    }
  }
  useEffect(() => {
    ref.current?.showModal();
    void abrir(1);
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        closeWithMotion(ref.current, onClose);
      }}
      data-own-motion
      className="dlg m-auto max-h-[min(720px,calc(100dvh-32px))] w-[min(720px,calc(100vw-32px))] rounded-3xl bg-[var(--bg)] p-0 text-ink shadow-[0_30px_80px_-20px_rgba(0,0,0,.45)] backdrop:bg-black/30 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex flex-col gap-3 p-6">
        <h2 id={titleId} className="text-lg font-bold tracking-[-0.02em]">
          Acessos
        </h2>
        <FormError message={erro} />
        {pagina && pagina.items.length === 0 && (
          <p className="text-sm text-ink2">Nada por aqui ainda.</p>
        )}
        {pagina && pagina.items.length > 0 && (
          <ol className="divide-y divide-line text-sm">
            {pagina.items.map((a) => (
              <Linha key={a.id} a={a} euId={euId} agora={agora} novo={a.id > vistoAte} />
            ))}
          </ol>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {pagina && (pagina.page > 1 || pagina.hasMore) && (
            <>
              <button
                type="button"
                className={quietButton}
                disabled={pagina.page <= 1}
                onClick={() => void abrir(pagina.page - 1)}
              >
                Anterior
              </button>
              <button
                type="button"
                className={quietButton}
                disabled={!pagina.hasMore}
                onClick={() => void abrir(pagina.page + 1)}
              >
                Próxima
              </button>
            </>
          )}
          <button
            type="button"
            className={quietButton}
            onClick={() => closeWithMotion(ref.current, onClose)}
          >
            Fechar
          </button>
        </div>
      </div>
    </dialog>
  );
}
