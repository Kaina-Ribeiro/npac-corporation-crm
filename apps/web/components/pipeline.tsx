'use client';
import type { LeadCatalog, Page, LeadDTO, PipelineDTO, PipelineLead, StageKey } from '@npac/shared';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/client-api';
import { button, control, FormError, quietButton, StageOptions } from './crm-ui';
import { LeadFilters, readFilters } from './lead-filters';
import { useCrmRefresh } from './shell/live-updates';

export function Pipeline({ initial, catalog }: { initial: PipelineDTO; catalog: LeadCatalog }) {
  const [columns, setColumns] = useState(initial);
  const [active, setActive] = useState<StageKey>('SONDAGEM');
  const [visible, setVisible] = useState(catalog.stages.map((s) => s.key));
  const [filters, setFilters] = useState<Record<string, string>>({});
  useCrmRefresh(() => load());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function load(selected = filters) {
    const fresh = await clientApi<PipelineDTO>('/api/leads/pipeline/search', 'POST', selected);
    setColumns(fresh);
    setActive((old) =>
      fresh.some((c) => c.stage.key === old) ? old : (fresh[0]?.stage.key ?? old),
    );
  }
  async function move(lead: PipelineLead, target: string) {
    if (busy || lead.stageKey === target) return;
    setBusy(true);
    setError('');
    try {
      await clientApi(`/api/leads/${lead.id}`, 'PATCH', {
        version: lead.version,
        stageKey: target,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const selected = { ...readFilters(f), search: String(f.get('q') ?? '') };
    setBusy(true);
    setError('');
    setFilters(selected);
    try {
      await load(selected);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function more(stage: StageKey, page: number) {
    setBusy(true);
    setError('');
    try {
      const data = await clientApi<Page<LeadDTO>>('/api/leads/search', 'POST', {
        ...filters,
        stage,
        page,
        pageSize: 30,
      });
      setColumns((old) =>
        old.map((c) =>
          c.stage.key === stage
            ? {
                ...c,
                page,
                items: [...new Map([...c.items, ...data.items].map((l) => [l.id, l])).values()],
              }
            : c,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[34px] font-bold tracking-tight">Pipeline</h1>
      <form id="pipeline-search" onSubmit={submit} className="flex gap-2">
        <input
          name="q"
          className={control}
          aria-label="Buscar no Pipeline"
          placeholder="Nome, WhatsApp ou @instagram"
        />
        <button className={button} disabled={busy}>
          Buscar
        </button>
      </form>
      <LeadFilters catalog={catalog} form="pipeline-search" />
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Colunas visíveis</summary>
        <div className="mt-3 flex flex-wrap gap-3">
          {catalog.stages.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={visible.includes(s.key)}
                onChange={(e) =>
                  setVisible(
                    e.target.checked ? [...visible, s.key] : visible.filter((k) => k !== s.key),
                  )
                }
              />
              {s.label}
            </label>
          ))}
        </div>
      </details>
      <FormError message={error} />
      <nav aria-label="Etapas do Pipeline" className="flex gap-2 overflow-x-auto pb-2 md:hidden">
        {columns
          .filter((c) => visible.includes(c.stage.key))
          .map((c) => (
            <button
              key={c.stage.id}
              onClick={() => setActive(c.stage.key)}
              aria-pressed={active === c.stage.key}
              className={`${quietButton} shrink-0 ${active === c.stage.key ? 'bg-[var(--on)]' : ''}`}
            >
              {c.stage.label} ({c.total})
            </button>
          ))}
      </nav>
      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {columns
          .filter((c) => visible.includes(c.stage.key))
          .map((c) => (
            <section
              key={c.stage.id}
              aria-label={c.stage.label}
              className={`glass-card w-full shrink-0 flex-col gap-3 p-3 md:w-[280px] ${active === c.stage.key ? 'flex' : 'hidden md:flex'}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                const lead = columns.flatMap((col) => col.items).find((l) => l.id === id);
                if (lead) void move(lead, c.stage.key);
              }}
            >
              <h2 className="flex justify-between gap-2 px-1 text-sm font-semibold">
                {c.stage.label}
                <span className="text-ink2">{c.total}</span>
              </h2>
              {c.items.map((l) => (
                <article
                  key={l.id}
                  draggable={!busy}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)}
                  className="rounded-2xl border border-line bg-[var(--gl2)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link className="text-sm font-semibold" href={`/leads/${l.id}`}>
                      {l.name}
                    </Link>
                    <span className={`tier tier-${l.tier}`}>{l.tier}</span>
                  </div>
                  <p className="my-2 text-xs text-ink2">
                    {l.nextContactAt
                      ? new Date(l.nextContactAt).toLocaleDateString('pt-BR', {
                          timeZone: 'America/Sao_Paulo',
                        })
                      : 'Sem próximo contato'}
                  </p>
                  <select
                    aria-label={`Mover ${l.name} para`}
                    className="w-full rounded-lg border border-line p-2 text-xs"
                    value={l.stageKey}
                    disabled={busy}
                    onChange={(e) => void move(l, e.target.value)}
                  >
                    <StageOptions stages={catalog.stages} current={l.stageKey} />
                  </select>
                </article>
              ))}
              {c.items.length === 0 && (
                <p className="px-1 py-5 text-center text-xs text-ink2">Nenhum lead nesta etapa.</p>
              )}
              {c.items.length < c.total && (
                <button
                  disabled={busy}
                  className={quietButton}
                  onClick={() => void more(c.stage.key, c.page + 1)}
                >
                  Carregar mais
                </button>
              )}
            </section>
          ))}
      </div>
    </div>
  );
}
