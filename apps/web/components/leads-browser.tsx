'use client';
import type { LeadCatalog, LeadDTO, Page, Role } from '@npac/shared';
import { INCOME_BAND_LABELS, TIERS } from '@npac/shared/enums';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { clientApi } from '@/lib/client-api';
import { LeadFilters, readFilters } from './lead-filters';
import { useCrmRefresh } from './shell/live-updates';

type Change = Partial<Pick<LeadDTO, 'stageKey' | 'tier'>> & {
  sdrId?: string;
  closerId?: string | null;
};

/** Select que parece texto até receber hover/foco (edição direto na célula, como no Attio). */
const cell =
  'max-w-full cursor-pointer rounded-lg border border-transparent bg-transparent py-1 pr-1 pl-1.5 text-[13px] text-ink transition-colors hover:border-line focus:border-line disabled:cursor-default disabled:hover:border-transparent';
const barSelect =
  'h-9 rounded-xl border border-line bg-[var(--on)] px-2.5 text-sm font-medium text-ink disabled:opacity-50';

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
  role,
}: {
  initialData: Page<LeadDTO>;
  canCreate: boolean;
  catalog: LeadCatalog;
  role: Role;
}) {
  const [data, setData] = useState(initialData);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  const [bulkMsg, setBulkMsg] = useState('');
  // Mesmas regras da API: closer só move etapa; troca de responsável é do Head.
  const canTier = role !== 'CLOSER';
  const canAssign = role === 'HEAD';
  const sdrs = catalog.team.filter((u) => u.canProspect);
  const closers = catalog.team.filter((u) => u.canClose);
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
  /** PATCH com a versão da linha; atualiza só a linha local (sem recarregar a lista). */
  async function patch(l: LeadDTO, change: Change) {
    const r = await clientApi<{ version: number }>(`/api/leads/${l.id}`, 'PATCH', {
      version: l.version,
      ...change,
    });
    const person = (id: string) => ({
      id,
      name: catalog.team.find((u) => u.id === id)?.name ?? '',
    });
    setData((d) => ({
      ...d,
      items: d.items.map((x) =>
        x.id !== l.id
          ? x
          : {
              ...x,
              ...(change.stageKey ? { stageKey: change.stageKey } : {}),
              ...(change.tier ? { tier: change.tier } : {}),
              ...(change.sdrId ? { sdr: person(change.sdrId) } : {}),
              ...(change.closerId !== undefined
                ? { closer: change.closerId ? person(change.closerId) : null }
                : {}),
              version: r.version,
            },
      ),
    }));
  }
  async function edit(l: LeadDTO, change: Change) {
    setError('');
    setSaved('');
    try {
      await patch(l, change);
      setSaved('Salvo');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  /** Aplica a mesma mudança a cada lead selecionado; falhas (versão, acesso) são listadas. */
  async function bulk(change: Change) {
    setBusy(true);
    setError('');
    setBulkMsg('');
    let ok = 0;
    const failed: string[] = [];
    for (const l of data.items.filter((x) => selected.includes(x.id))) {
      try {
        await patch(l, change);
        ok++;
      } catch {
        failed.push(l.name);
      }
    }
    setBusy(false);
    setBulkMsg(
      `${ok} ${ok === 1 ? 'lead atualizado' : 'leads atualizados'}` +
        (failed.length ? ` · não foi possível: ${failed.join(', ')}` : ''),
    );
  }
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const allOnPage = data.items.length > 0 && data.items.every((l) => selected.includes(l.id));
  const stageSelect = (l: LeadDTO, className: string) => (
    <select
      aria-label={`Etapa de ${l.name}`}
      value={l.stageKey}
      onChange={(e) => void edit(l, { stageKey: e.target.value as LeadDTO['stageKey'] })}
      className={className}
    >
      {catalog.stages.map((st) => (
        <option key={st.key} value={st.key}>
          {st.label}
        </option>
      ))}
    </select>
  );
  const checkbox = (l: LeadDTO) => (
    <input
      type="checkbox"
      aria-label={`Selecionar ${l.name}`}
      checked={selected.includes(l.id)}
      onChange={(e) => toggle(l.id, e.target.checked)}
      className="size-4 accent-[var(--ink)]"
    />
  );
  const bar = (
    label: string,
    placeholder: string,
    options: [string, string][],
    run: (v: string) => Change,
  ) => (
    <select
      aria-label={label}
      value=""
      disabled={busy}
      onChange={(e) => void bulk(run(e.target.value))}
      className={barSelect}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {options.map(([v, text]) => (
        <option key={v} value={v}>
          {text}
        </option>
      ))}
    </select>
  );

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
                  {checkbox(l)}
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
                {stageSelect(l, `${cell} -ml-1.5 self-start border-line`)}
              </li>
            ))}
          </ul>

          {/* Desktop: tabela */}
          <div className="glass-card hidden overflow-x-auto md:block">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-left text-xs text-ink2">
                  <th
                    scope="col"
                    className="h-9 w-10 rounded-tl-[20px] border-b border-line bg-[rgba(118,118,128,.05)] pl-3.5"
                  >
                    <input
                      type="checkbox"
                      aria-label="Selecionar todos da página"
                      checked={allOnPage}
                      onChange={(e) =>
                        setSelected(e.target.checked ? data.items.map((l) => l.id) : [])
                      }
                      className="size-4 accent-[var(--ink)]"
                    />
                  </th>
                  {[
                    'Nome',
                    'Etapa',
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
                  <tr
                    key={l.id}
                    className={`transition-colors hover:bg-[rgba(118,118,128,.05)] ${
                      selected.includes(l.id) ? 'bg-[rgba(118,118,128,.08)]' : ''
                    }`}
                  >
                    <td className="border-b border-line pl-3.5">{checkbox(l)}</td>
                    <td className="h-[46px] border-b border-line px-3.5 font-semibold whitespace-nowrap">
                      <Link href={`/leads/${l.id}`}>{l.name}</Link>
                    </td>
                    <td className="border-b border-line px-2">{stageSelect(l, cell)}</td>
                    <td className="border-b border-line px-2">
                      <select
                        aria-label={`Perfil de ${l.name}`}
                        value={l.tier}
                        disabled={!canTier}
                        onChange={(e) => void edit(l, { tier: e.target.value as LeadDTO['tier'] })}
                        className={`${cell} font-semibold`}
                      >
                        {TIERS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
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
                    <td className="border-b border-line px-2">
                      {canAssign ? (
                        <select
                          aria-label={`SDR de ${l.name}`}
                          value={l.sdr.id}
                          onChange={(e) => void edit(l, { sdrId: e.target.value })}
                          className={cell}
                        >
                          {sdrs.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="px-1.5">{l.sdr.name}</span>
                      )}
                    </td>
                    <td className="border-b border-line px-2">
                      {canAssign ? (
                        <select
                          aria-label={`Closer de ${l.name}`}
                          value={l.closer?.id ?? ''}
                          onChange={(e) => void edit(l, { closerId: e.target.value || null })}
                          className={cell}
                        >
                          <option value="">—</option>
                          {closers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="px-1.5">{l.closer?.name ?? '—'}</span>
                      )}
                    </td>
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

      <p role="status" className="sr-only">
        {saved}
      </p>
      {selected.length > 0 && (
        <section
          aria-label="Ações em massa"
          className="glass fixed right-3.5 bottom-[calc(max(16px,env(safe-area-inset-bottom))+80px)] left-3.5 z-30 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl p-2.5 shadow-[0_14px_34px_-14px_rgba(0,0,0,.35)] md:bottom-6 md:left-[268px]"
        >
          <b className="px-2 text-sm">
            {selected.length} {selected.length === 1 ? 'selecionado' : 'selecionados'}
          </b>
          {bar(
            'Mover para etapa',
            'Mover para…',
            catalog.stages.map((st) => [st.key, st.label]),
            (v) => ({ stageKey: v as LeadDTO['stageKey'] }),
          )}
          {canTier &&
            bar(
              'Mudar perfil',
              'Perfil…',
              TIERS.map((t) => [t, t]),
              (v) => ({ tier: v as LeadDTO['tier'] }),
            )}
          {canAssign &&
            bar(
              'Trocar SDR',
              'SDR…',
              sdrs.map((u) => [u.id, u.name]),
              (v) => ({ sdrId: v }),
            )}
          {canAssign &&
            bar(
              'Trocar closer',
              'Closer…',
              closers.map((u) => [u.id, u.name]),
              (v) => ({ closerId: v }),
            )}
          <button
            type="button"
            onClick={() => {
              setSelected([]);
              setBulkMsg('');
            }}
            className="ml-auto h-9 rounded-xl px-3 text-sm font-semibold text-ink2 hover:bg-black/5"
          >
            Limpar
          </button>
          {bulkMsg && (
            <p role="status" className="w-full px-2 text-xs text-ink2">
              {bulkMsg}
            </p>
          )}
        </section>
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
