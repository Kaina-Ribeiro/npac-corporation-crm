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
import {
  pipelineRules,
  readLeadFilters,
  readPipelinePrefs,
  writePrefs,
} from '@npac/shared/screen-prefs';
import Link from 'next/link';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { clientApi } from '@/lib/client-api';
import { parseHidden, PIPE_COOKIE_PATH, serializeHidden } from '@/lib/pipeline-columns';
import { stageNeedsFields, type StageFieldsBody } from '@/lib/stage-fields';
import { keep, recall } from '@/lib/screen-memory';
import { rememberPrefs } from '@/lib/screen-prefs';
import { readPreference, savePreference } from '@/lib/user-cookie';
import { control, FormError, quietButton, StageOptions } from './crm-ui';
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
  cookie,
  initialHidden,
  prefs,
  initialFilters = {},
  initialCol,
}: {
  initial: PipelineDTO;
  catalog: LeadCatalog;
  canCreate: boolean;
  role: Role;
  /** Cookie da pessoa com as colunas ocultas (pedido do Igor, 10/11/2026). */
  cookie: string;
  initialHidden: StageKey[];
  /** Filtros lembrados (NPAC-46): cookie, valor que o servidor usou e se ele vence o cookie. */
  prefs: { cookie: string; value: string; force: boolean };
  initialFilters?: Record<string, string>;
  /** Coluna aberta no celular. */
  initialCol?: string;
  /** Liderança cria, renomeia, reordena e exclui colunas (pedido de 04/11/2026). */
  canEditColumns?: boolean;
}) {
  const [columns, setColumns] = useState(initial);
  const canRegister = can({ role }, 'sale:register');
  const [active, setActive] = useState<StageKey>((initialCol as StageKey) ?? 'SONDAGEM');
  // Etapas vivas (o editor de colunas muda a lista) e as ocultas pela pessoa: coluna nova aparece.
  const [stages, setStages] = useState(catalog.stages);
  const [hidden, setHidden] = useState<StageKey[]>(initialHidden);
  // Voltar no navegador reaproveita a página antiga: ao montar, o cookie tem a escolha mais recente.
  const mounted = useRef({ cookie, keys: catalog.stages.map((s) => s.key) });
  useLayoutEffect(() => {
    const { cookie, keys } = mounted.current;
    if (!cookie) return;
    const now = parseHidden(readPreference(cookie), keys);
    setHidden((prev) => (serializeHidden(prev) === serializeHidden(now) ? prev : now));
  }, []);
  function toggleColumn(key: StageKey, visible: boolean) {
    const next = visible ? hidden.filter((k) => k !== key) : [...hidden, key];
    setHidden(next);
    if (cookie) savePreference(cookie, serializeHidden(next), PIPE_COOKIE_PATH);
  }
  const [editing, setEditing] = useState(false);
  // Filtros aplicados; `search` é o texto buscado (só na memória, nunca no cookie).
  const [filters, setFilters] = useState<Record<string, string>>(initialFilters);
  const [formKey, setFormKey] = useState(0);
  const qInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const rules = pipelineRules(catalog);
  /** Cookie: filtros sem padrões (intervalo só com as duas datas) + coluna aberta. */
  function remember(f: Record<string, string>, col: string = active) {
    const clean = readLeadFilters(writePrefs(f, rules), catalog);
    rememberPrefs('pipeline', prefs.cookie, writePrefs({ ...clean, col }, rules));
  }
  const shownFilters = Object.fromEntries(Object.entries(filters).filter(([k]) => k !== 'search'));
  const filtered = !!writePrefs(readLeadFilters(writePrefs(shownFilters, rules), catalog), rules);
  useCrmRefresh(() => load());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Mudança que pede dados da etapa (NPAC-38): a janelinha pergunta antes de salvar.
  const [pending, setPending] = useState<{ lead: PipelineLead; target: string } | null>(null);
  async function load(selected = filters) {
    const mine = ++seq.current;
    const fresh = await clientApi<PipelineDTO>('/api/leads/pipeline/search', 'POST', selected);
    if (mine !== seq.current) return;
    setColumns(fresh);
    if (prefs.cookie) keep(prefs.cookie, selected.search || undefined);
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
  // Ao montar: voltar do navegador (cookie mais novo que a página) e texto buscado na memória.
  const boot = useRef({ prefs, catalog, load, initialFilters });
  useEffect(() => {
    const { prefs, catalog, load, initialFilters } = boot.current;
    if (!prefs.cookie) return;
    const term = recall<string>(prefs.cookie);
    let next: Record<string, string> = initialFilters;
    let changed = false;
    if (prefs.force) rememberPrefs('pipeline', prefs.cookie, prefs.value);
    else {
      const saved = readPreference(prefs.cookie) ?? '';
      if (saved !== prefs.value) {
        const { col, ...f } = readPipelinePrefs(saved, catalog);
        const value = writePrefs({ ...f, col }, pipelineRules(catalog));
        rememberPrefs('pipeline', prefs.cookie, value);
        if (value !== prefs.value) {
          next = f;
          changed = true;
          if (col) setActive(col as StageKey);
          setFormKey((k) => k + 1);
        }
      }
    }
    if (term && qInput.current) qInput.current.value = term;
    if (!changed && !term) return;
    const selected = { ...next, ...(term ? { search: term } : {}) };
    setFilters(selected);
    void load(selected).catch((e: Error) => setError(e.message));
  }, []);
  async function run(selected: Record<string, string>) {
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
  /** Texto da busca no Enter (telefone e e-mail só são achados inteiros). */
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const selected = readFilters(f);
    if (selected.period === 'RANGE' && !(selected.from && selected.to)) return;
    const search = String(f.get('q') ?? '').trim();
    remember(selected);
    void run({ ...selected, ...(search ? { search } : {}) });
  }
  /** Filtro vale ao escolher (NPAC-46), com o texto já buscado. */
  function applyFilters() {
    const el = document.getElementById('pipeline-search');
    if (!(el instanceof HTMLFormElement)) return;
    const selected = readFilters(new FormData(el));
    if (selected.period === 'RANGE' && !(selected.from && selected.to)) return;
    remember(selected);
    void run({ ...selected, ...(filters.search ? { search: filters.search } : {}) });
  }
  function clearFilters() {
    remember({});
    setFormKey((k) => k + 1);
    void run(filters.search ? { search: filters.search } : {});
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
  // No celular aparece uma etapa por vez: se a escolhida estiver oculta, vale a primeira visível.
  const shown = columns.filter((c) => !hidden.includes(c.stage.key));
  const current = shown.some((c) => c.stage.key === active) ? active : shown[0]?.stage.key;
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
      <form id="pipeline-search" role="search" onSubmit={submit} className="flex gap-2">
        <input
          ref={qInput}
          name="q"
          type="search"
          enterKeyHint="search"
          className={control}
          aria-label="Buscar no Pipeline"
          placeholder="Nome, WhatsApp, @instagram ou e-mail"
        />
      </form>
      <LeadFilters
        key={formKey}
        catalog={catalog}
        form="pipeline-search"
        values={shownFilters}
        onApply={applyFilters}
        onClear={filtered ? clearFilters : undefined}
      />
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold">Colunas visíveis</summary>
        <div className="mt-3 flex flex-wrap gap-3">
          {stages.map((s) => (
            <label key={s.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={!hidden.includes(s.key)}
                onChange={(e) => toggleColumn(s.key, e.target.checked)}
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
              onClick={() => {
                setActive(c.stage.key);
                remember(shownFilters, c.stage.key);
              }}
              aria-pressed={current === c.stage.key}
              className={`${quietButton} shrink-0 ${current === c.stage.key ? 'bg-[var(--on)]' : ''}`}
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
              className={`reveal glass-card scroll-thin min-w-0 flex-col gap-3 p-3 md:max-h-[min(70vh,720px)] md:overflow-y-auto ${current === c.stage.key ? 'flex' : 'hidden md:flex'}`}
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
                  {l.paymentToComplete && (
                    <div className="mt-2">
                      <span className="sale-pending">Pagamento a completar</span>
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
