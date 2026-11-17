import type { LeadCatalog } from '@npac/shared';
import {
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_OPTIONS,
  LEGACY_LEAD_SOURCES,
  FORM_LEAD_SOURCE,
  TIER_LABELS,
  TIERS,
} from '@npac/shared/enums';
import { control, Field, quietButton } from './crm-ui';

/**
 * Campos associados a um form POST em memória; nenhum filtro pessoal vai para a URL. Cada mudança
 * chama `onApply` (o filtro vale ao escolher, NPAC-46); a busca por texto segue no Enter.
 */
export function LeadFilters({
  catalog,
  form,
  values = {},
  onApply,
  onClear,
}: {
  catalog: LeadCatalog;
  form: string;
  /** Valores iniciais (filtro salvo aplicado); troque a `key` do componente para reaplicar. */
  values?: Record<string, string>;
  onApply: () => void;
  /** Mostra "Limpar filtros" quando há filtro fora do padrão. */
  onClear?: () => void;
}) {
  return (
    <details className="glass-card p-4" open={Object.keys(values).length > 0 || undefined}>
      <summary className="cursor-pointer text-sm font-semibold">Filtrar e ordenar</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onChange={onApply}>
        <Field label="Etapa do lead">
          <select name="stage" form={form} defaultValue={values.stage ?? ''} className={control}>
            <option value="">Todas</option>
            {catalog.stages.map((s) => (
              <option key={s.id} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Perfil do lead">
          <select name="tier" form={form} defaultValue={values.tier ?? ''} className={control}>
            <option value="">Todos</option>
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Origem do lead">
          <select name="source" form={form} defaultValue={values.source ?? ''} className={control}>
            <option value="">Todas</option>
            {[...LEAD_SOURCE_OPTIONS, ...LEGACY_LEAD_SOURCES, FORM_LEAD_SOURCE].map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Responsável SDR">
          <select name="sdrId" form={form} defaultValue={values.sdrId ?? ''} className={control}>
            <option value="">Todos</option>
            {catalog.team
              .filter((u) => u.canProspect)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Closer">
          <select
            name="closerId"
            form={form}
            defaultValue={values.closerId ?? ''}
            className={control}
          >
            <option value="">Todos</option>
            {catalog.team
              .filter((u) => u.canClose)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Período do próximo contato">
          <select name="period" form={form} defaultValue={values.period ?? ''} className={control}>
            <option value="">Qualquer data</option>
            <option value="TODAY">Hoje</option>
            <option value="TOMORROW">Amanhã</option>
            <option value="WEEK">Próximos 7 dias</option>
            <option value="OVERDUE">Atrasados</option>
            <option value="NO_DATE">Sem data</option>
            <option value="RANGE">Intervalo</option>
          </select>
        </Field>
        <Field label="De">
          <input
            form={form}
            name="from"
            defaultValue={values.from}
            type="date"
            className={control}
          />
        </Field>
        <Field label="Até">
          <input form={form} name="to" defaultValue={values.to} type="date" className={control} />
        </Field>
        <Field label="Ordenar por">
          <select form={form} name="sort" defaultValue={values.sort} className={control}>
            <option value="createdAt">Criação</option>
            <option value="nextContactAt">Próximo contato</option>
            <option value="meetingAt">Reunião</option>
            <option value="name">Nome</option>
          </select>
        </Field>
        <Field label="Direção">
          <select form={form} name="direction" defaultValue={values.direction} className={control}>
            <option value="desc">Decrescente</option>
            <option value="asc">Crescente</option>
          </select>
        </Field>
      </div>
      {onClear && (
        <button type="button" onClick={onClear} className={`${quietButton} mt-4`}>
          Limpar filtros
        </button>
      )}
    </details>
  );
}

export function readFilters(data: FormData): Record<string, string> {
  return Object.fromEntries(
    ['tier', 'source', 'stage', 'sdrId', 'closerId', 'period', 'from', 'to', 'sort', 'direction']
      .map((k) => [k, String(data.get(k) ?? '')])
      .filter(([, v]) => v),
  );
}
