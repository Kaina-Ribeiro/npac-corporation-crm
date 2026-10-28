'use client';
import type { LeadCatalog, LeadDTO, Page } from '@npac/shared';
import { INCOME_BAND_LABELS } from '@npac/shared/enums';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { LeadFilters, readFilters } from './lead-filters';
import { useCrmRefresh } from './shell/live-updates';

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Sao_Paulo',
});

/** Busca só em memória: contatos nunca vão para URL ou armazenamento persistente. */
export function LeadsBrowser({
  initialData,
  canCreate,
  catalog,
}: {
  initialData: Page<LeadDTO>;
  canCreate: boolean;
  catalog: LeadCatalog;
}) {
  const [data, setData] = useState(initialData);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  useCrmRefresh(() => search(q, data.page));
  const page = data.page;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));

  async function search(term: string, target = 1, selected = filters) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/leads/search', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...selected, search: term, page: target, pageSize: 20 }),
      });
      if (res.status === 401) {
        window.location.replace('/login');
        return;
      }
      if (!res.ok) throw new Error();
      setData((await res.json()) as Page<LeadDTO>);
      setQ(term);
    } catch {
      setError('Não foi possível buscar. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const selected = readFilters(f);
    setFilters(selected);
    void search(String(f.get('q') ?? '').trim(), 1, selected);
  }
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mt-1.5 text-[34px] leading-tight font-bold tracking-[-0.04em]">Leads</h1>
          <p className="text-[15px] text-ink2">
            {data.total} {data.total === 1 ? 'lead' : 'leads'}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/leads/new"
            className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-[var(--bg)]"
          >
            Novo lead
          </Link>
        )}
        <form
          id="lead-search"
          role="search"
          onSubmit={submit}
          className="relative w-full md:w-[340px]"
        >
          <label htmlFor="q" className="sr-only">
            Buscar por nome, WhatsApp ou Instagram
          </label>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink3"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            id="q"
            name="q"
            defaultValue={q}
            placeholder="Nome, WhatsApp ou @instagram"
            className="h-10 w-full rounded-xl border-0 bg-[rgba(118,118,128,.12)] pr-3 pl-9 text-base"
          />
        </form>
      </div>

      <LeadFilters catalog={catalog} form="lead-search" />
      {error && <p role="alert">{error}</p>}
      {data.items.length === 0 ? (
        <section className="glass-card p-6 text-center text-sm text-ink2">
          {q ? 'Nenhum lead encontrado para essa busca.' : 'Nenhum lead por aqui ainda.'}
        </section>
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="flex flex-col gap-2.5 md:hidden">
            {data.items.map((l) => (
              <li key={l.id} className="glass-card flex flex-col gap-2 p-3.5">
                <div className="flex items-center gap-2.5">
                  <Link href={`/leads/${l.id}`} className="flex-1 truncate text-base font-semibold">
                    {l.name}
                  </Link>
                  <span className={`tier tier-${l.tier}`}>{l.tier}</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink2">
                  <span>{INCOME_BAND_LABELS[l.incomeBand]}</span>
                  {l.instagram && <span>@{l.instagram}</span>}
                  <span>SDR {l.sdr.name}</span>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: tabela */}
          <div className="glass-card hidden overflow-x-auto md:block">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-left text-xs text-ink2">
                  {[
                    'Nome',
                    'Perfil',
                    'Renda',
                    'Instagram',
                    'WhatsApp',
                    'SDR',
                    'Closer',
                    'Criado',
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="h-9 border-b border-line bg-[rgba(118,118,128,.05)] px-3.5 font-medium whitespace-nowrap first:rounded-tl-[20px] last:rounded-tr-[20px]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((l) => (
                  <tr key={l.id} className="transition-colors hover:bg-[rgba(118,118,128,.05)]">
                    <td className="h-[46px] border-b border-line px-3.5 font-semibold whitespace-nowrap">
                      <Link href={`/leads/${l.id}`}>{l.name}</Link>
                    </td>
                    <td className="border-b border-line px-3.5">
                      <span className={`tier tier-${l.tier}`}>{l.tier}</span>
                    </td>
                    <td className="border-b border-line px-3.5 whitespace-nowrap">
                      {INCOME_BAND_LABELS[l.incomeBand]}
                    </td>
                    <td className="border-b border-line px-3.5 text-ink2">
                      {l.instagram ? `@${l.instagram}` : '—'}
                    </td>
                    <td className="border-b border-line px-3.5 whitespace-nowrap text-ink2">
                      {l.phone ?? '—'}
                    </td>
                    <td className="border-b border-line px-3.5">{l.sdr.name}</td>
                    <td className="border-b border-line px-3.5">{l.closer?.name ?? '—'}</td>
                    <td className="border-b border-line px-3.5 whitespace-nowrap text-ink2">
                      {dateFmt.format(new Date(l.createdAt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <button
              disabled={busy}
              className="glass rounded-full px-4 py-2 font-semibold"
              onClick={() => search(q, page - 1)}
            >
              Anterior
            </button>
          )}
          <span className="text-ink2">
            Página {page} de {pages}
          </span>
          {page < pages && (
            <button
              disabled={busy}
              className="glass rounded-full px-4 py-2 font-semibold"
              onClick={() => search(q, page + 1)}
            >
              Próxima
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
