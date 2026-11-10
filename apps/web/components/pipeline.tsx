'use client';
import type {
  LeadCatalog,
  Page,
  LeadDTO,
  PipelineDTO,
  PipelineLead,
  Role,
  StageKey,
} from '@npac/shared';
import { INCOME_DISCOVERY_STAGE, TIER_LABELS } from '@npac/shared/enums';
import { can } from '@npac/shared/permissions';
import Link from 'next/link';
import { useState, type CSSProperties, type FormEvent } from 'react';
import { clientApi } from '@/lib/client-api';
import { stageNeedsFields, type StageFieldsBody } from '@/lib/stage-fields';
import { button, control, FormError, quietButton, StageOptions } from './crm-ui';
import { LeadFilters, readFilters } from './lead-filters';
import { PipelineColumnsEditor } from './pipeline-columns-editor';
import { StageMoveDialog } from './stage-move-dialog';
import { useCrmRefresh } from './shell/live-updates';

export function Pipeline({
  initial,
  catalog,
  canCreate,
  canEditColumns = false,
  role,
}: {
  initial: PipelineDTO;
  catalog: LeadCatalog;
  canCreate: boolean;
  role: Role;
  /** Liderança cria, renomeia, reordena e exclui colunas (pedido de 04/11/2026). */
  canEditColumns?: boolean;
}) {
  const [columns, setColumns] = useState(initial);
  const canRegister = can({ role }, 'sale:register');
  const [active, setActive] = useState<StageKey>('SONDAGEM');
  // Etapas vivas (o editor de colunas muda a lista) e as ocultas pela pessoa: coluna nova aparece.
  const [stages, setStages] = useState(catalog.stages);
  const [hidden, setHidden] = useState<StageKey[]>([]);
  const [editing, setEditing] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  useCrmRefresh(() => load());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Mudança que pede dados da etapa (NPAC-38): a janelinha pergunta antes de salvar.
  const [pending, setPending] = useState<{ lead: PipelineLead; target: string } | null>(null);
  async function load(selected = filters) {
    const fresh = await clientApi<PipelineDTO>('/api/leads/pipeline/search', 'POST', selected);
    setColumns(fresh);
    setActive((old) =>
      fresh.some((c) => c.stage.key === old) ? old : (fresh[0]?.stage.key ?? old),
    );
  }
  async function move(lead: PipelineLead, target: string) {
    if (busy || lead.stageKey === target) return;
    setError('');
    // Arrastar o card: o select já trava as outras etapas (a API recusa com a mesma regra).
    if (lead.tier === 'DESCOBRINDO' && target !== INCOME_DISCOVERY_STAGE) {
      setError(
        `${lead.name} está em Descobrindo renda. Informe a faixa de renda antes de mudar a etapa.`,
      );
      return;
    }
    if (stageNeedsFields(target)) {
      setPending({ lead, target });
      return;
    }
    setBusy(true);
    try {
      await save(lead, target);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(lead: PipelineLead, target: string, fields: StageFieldsBody = {}) {
    await clientApi(`/api/leads/${lead.id}`, 'PATCH', {
      version: lead.version,
      stageKey: target,
      ...fields,
    });
    await load();
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[34px] font-bold tracking-tight">Pipeline</h1>
        <div className="flex flex-wrap items-center gap-2">
          {canEditColumns && (
            <button
              type="button"
              aria-expanded={editing}
              className={`${quietButton} min-h-10`}
              onClick={() => setEditing((v) => !v)}
            >
              Editar colunas
            </button>
          )}
          {canCreate && (
            <Link
              href="/leads/new"
              className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-[var(--bg)] active:scale-[.97]"
            >
              Novo lead
            </Link>
          )}
        </div>
      </div>
      {editing && (
        <PipelineColumnsEditor
          stages={stages}
          onChanged={async () => {
            setStages((await clientApi<LeadCatalog>('/api/leads/catalog')).stages);
            await load();
          }}
        />
      )}
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
          {stages.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!hidden.includes(s.key)}
                onChange={(e) =>
                  setHidden(
                    e.target.checked ? hidden.filter((k) => k !== s.key) : [...hidden, s.key],
                  )
                }
              />
              {s.label}
            </label>
          ))}
        </div>
      </details>
      <FormError message={error} />
      {pending && (
        <StageMoveDialog
          key={`${pending.lead?.id ?? 'massa'}-${pending.target}`}
          title={`Mover ${pending.lead.name} para ${stages.find((s) => s.key === pending.target)?.label ?? 'a etapa'}`}
          stage={pending.target}
          lead={pending.lead}
          team={catalog.team}
          role={role}
          onSubmit={(fields) => save(pending.lead, pending.target, fields)}
          // Cancelar não muda nada: o card continua na etapa antiga.
          onClose={() => setPending(null)}
        />
      )}
      <nav aria-label="Etapas do Pipeline" className="flex gap-2 overflow-x-auto pb-2 md:hidden">
        {columns
          .filter((c) => !hidden.includes(c.stage.key))
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
      {/* Grade que quebra linha em vez de rolar para o lado: mais colunas quanto mais larga a tela
          (≈4 em 1440, 6 em 1920, 8 em 2560). No celular, uma etapa por vez pelas abas acima. */}
      <div
        data-own-motion
        className="grid items-start gap-4 pb-4 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]"
      >
        {columns
          .filter((c) => !hidden.includes(c.stage.key))
          .map((c, col) => (
            <section
              key={c.stage.id}
              aria-label={c.stage.label}
              // Entrada em cascata (globals.css `.reveal`): coluna por coluna, depois os cards.
              style={{ '--delay': `${200 + col * 90}ms` } as CSSProperties}
              className={`reveal glass-card scroll-thin min-w-0 flex-col gap-3 p-3 md:max-h-[min(70vh,720px)] md:overflow-y-auto ${active === c.stage.key ? 'flex' : 'hidden md:flex'}`}
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
              {c.items.map((l, i) => (
                <article
                  key={l.id}
                  draggable={!busy}
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', l.id)}
                  style={
                    { '--delay': `${360 + col * 90 + Math.min(i, 8) * 55}ms` } as CSSProperties
                  }
                  className="reveal rounded-2xl border border-line bg-[var(--gl2)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Link className="text-sm font-semibold" href={`/leads/${l.id}`}>
                      {l.name}
                    </Link>
                    <span className={`tier tier-${l.tier}`}>{TIER_LABELS[l.tier]}</span>
                  </div>
                  {l.saleToRegister && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="sale-pending">Venda a registrar</span>
                      {canRegister && (
                        <Link
                          className="text-xs font-semibold text-gold-deep underline-offset-2 hover:underline"
                          href={`/leads/${l.id}#vendas`}
                        >
                          Registrar venda
                        </Link>
                      )}
                    </div>
                  )}
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
                    <StageOptions
                      stages={stages}
                      current={l.stageKey}
                      incomeUnknown={l.tier === 'DESCOBRINDO'}
                    />
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
