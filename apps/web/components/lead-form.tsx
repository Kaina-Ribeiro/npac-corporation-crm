'use client';
import {
  leadCreateSchema,
  leadUpdateSchema,
  type LeadCatalog,
  type LeadDTO,
  type Role,
} from '@npac/shared';
import { INCOME_BAND_LABELS, LEAD_SOURCES, TIERS } from '@npac/shared/enums';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { brasiliaInput, clientApi } from '@/lib/client-api';
import { button, control, Field, FormError } from './crm-ui';

export function LeadForm({
  catalog,
  me,
  lead,
}: {
  catalog: LeadCatalog;
  me: { id: string; role: Role };
  lead?: LeadDTO;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const raw: Record<string, unknown> = {
      ...f,
      nextContactAt: brasiliaInput(String(f.nextContactAt ?? '')),
    };
    if (me.role !== 'HEAD') {
      delete raw.sdrId;
      delete raw.closerId;
    } else if (!raw.closerId) {
      if (lead) raw.closerId = null;
      else delete raw.closerId;
    }
    if (lead && !raw.nextContactAt) raw.nextContactAt = null;
    if (lead) {
      raw.version = lead.version;
      if (!raw.phone) raw.phone = null;
      if (!raw.instagram) raw.instagram = null;
    }
    const parsed = (lead ? leadUpdateSchema : leadCreateSchema).safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Confira os campos.');
      setBusy(false);
      return;
    }
    try {
      const result = await clientApi<{ id: string }>(
        lead ? `/api/leads/${lead.id}` : '/api/leads',
        lead ? 'PATCH' : 'POST',
        parsed.data,
      );
      router.push(`/leads/${result.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nome">
          <input
            className={control}
            name="name"
            defaultValue={lead?.name}
            minLength={2}
            maxLength={120}
            required
          />
        </Field>
        <Field label="WhatsApp">
          <input
            className={control}
            name="phone"
            defaultValue={lead?.phone ?? ''}
            inputMode="tel"
            autoComplete="off"
          />
        </Field>
        <Field label="Instagram">
          <input
            className={control}
            name="instagram"
            defaultValue={lead?.instagram ?? ''}
            placeholder="@usuario"
            autoComplete="off"
          />
        </Field>
        <Field label="Faixa de renda">
          <select
            className={control}
            name="incomeBand"
            defaultValue={lead?.incomeBand ?? ''}
            required
          >
            <option value="" disabled>
              Escolha a faixa
            </option>
            {Object.entries(INCOME_BAND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Perfil">
          <select className={control} name="tier" defaultValue={lead?.tier ?? 'P1'}>
            {TIERS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Origem">
          <select className={control} name="source" defaultValue={lead?.source ?? 'INSTAGRAM'}>
            {LEAD_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Etapa">
          <select className={control} name="stageKey" defaultValue={lead?.stageKey ?? 'SONDAGEM'}>
            {catalog.stages.map((s) => (
              <option key={s.id} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Próximo contato (Brasília)">
          <input
            className={control}
            name="nextContactAt"
            type="datetime-local"
            defaultValue={
              lead?.nextContactAt
                ? new Date(lead.nextContactAt)
                    .toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' })
                    .replace(' ', 'T')
                    .slice(0, 16)
                : ''
            }
          />
        </Field>
        {me.role === 'HEAD' && (
          <>
            <Field label="SDR responsável">
              <select
                className={control}
                name="sdrId"
                defaultValue={lead?.sdr.id ?? me.id}
                required
              >
                <option value="">Escolha</option>
                {catalog.team
                  .filter((u) => u.canProspect)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Closer sugerido">
              <select className={control} name="closerId" defaultValue={lead?.closer?.id ?? ''}>
                <option value="">Sem sugestão</option>
                {catalog.team
                  .filter((u) => u.canClose)
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
      </div>
      <Field label="Resumo / dor principal">
        <textarea
          className={`${control} min-h-24 py-3`}
          name="summary"
          maxLength={5000}
          defaultValue={lead?.summary ?? ''}
        />
      </Field>
      <FormError message={error} />
      <button className={`${button} self-start`} disabled={busy}>
        {busy ? 'Salvando…' : lead ? 'Salvar alterações' : 'Cadastrar lead'}
      </button>
    </form>
  );
}
