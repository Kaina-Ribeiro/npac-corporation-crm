'use client';
import {
  can,
  leadCreateSchema,
  leadUpdateSchema,
  type LeadCatalog,
  type LeadDTO,
  type ProductDTO,
  type Role,
} from '@npac/shared';
import {
  INCOME_BAND_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCE_OPTIONS,
  SOURCE_OTHER_MAX,
  TIER_BY_INCOME_BAND,
  TIER_LABELS,
  INCOME_DISCOVERY_STAGE,
  isLeader,
  type IncomeBand,
  isLegacyLeadSource,
} from '@npac/shared/enums';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { clientApi } from '@/lib/client-api';
import { readSoldFields } from '@/lib/sold-fields';
import { readStageFields } from '@/lib/stage-fields';
import { button, control, Field, FormError, StageOptions } from './crm-ui';
import { SoldFields } from './sold-fields';
import { StageFields, type OpenMeeting } from './stage-fields';

export function LeadForm({
  catalog,
  me,
  lead: latestLead,
  products,
  openMeeting,
}: {
  catalog: LeadCatalog;
  me: { id: string; role: Role };
  lead?: LeadDTO;
  /** Produtos ativos, para o Agendou Pagamento. */
  products: ProductDTO[];
  /** Reunião futura aberta do lead: mudar para Agendado não pede outra. */
  openMeeting?: OpenMeeting | null;
}) {
  const router = useRouter();
  // O rascunho pertence à versão exibida ao abrir o formulário. SSE não pode
  // avançar esta versão silenciosamente e autorizar um overwrite de campos antigos.
  const [lead, setLead] = useState(latestLead);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState<string>(lead?.source ?? '');
  // O perfil vem da faixa de renda (a API e o banco aplicam a mesma regra); aqui só é mostrado.
  const [band, setBand] = useState<IncomeBand | ''>(lead?.incomeBand ?? '');
  const tier = band ? TIER_BY_INCOME_BAND[band] : null;
  // A etapa escolhida troca os campos (NPAC-38); na edição, só a troca pede os dados da etapa.
  const [stage, setStage] = useState<string>(lead?.stageKey ?? 'SONDAGEM');
  const changed = !lead || stage !== lead.stageKey;
  // Venda Fechada só no cadastro (NPAC-39): reunião realizada + venda opcional.
  const sold = !lead && stage === 'VENDA';
  // Mesma chave nas novas tentativas: a API devolve o mesmo lead se a primeira já gravou.
  const [saleKey] = useState(() => crypto.randomUUID());
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    let stageBody;
    try {
      stageBody = sold
        ? readSoldFields(form, saleKey)
        : readStageFields(stage, form, { changed, withMeeting: !openMeeting, role: me.role });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
      return;
    }
    const raw: Record<string, unknown> = {
      ...Object.fromEntries([...form].filter(([k]) => !k.startsWith('sf_'))),
      ...stageBody,
    };
    // Cadastro sem data: o campo some do corpo. Na edição, vazio apaga (`null`).
    if (!lead && raw.nextContactAt === null) delete raw.nextContactAt;
    if (!isLeader(me.role)) {
      delete raw.sdrId;
      delete raw.closerId;
    } else if (!raw.closerId) {
      if (lead) raw.closerId = null;
      else delete raw.closerId;
    }
    if (lead) {
      raw.version = lead.version;
      if (!raw.phone) raw.phone = null;
      if (!raw.instagram) raw.instagram = null;
      if (!raw.email) raw.email = null;
      if (raw.source !== 'OUTRO') raw.sourceOther = null;
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
      if (lead) setLead(await clientApi<LeadDTO>(`/api/leads/${result.id}`));
      router.push(`/leads/${result.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form key={lead?.version ?? 'new'} onSubmit={submit} className="flex flex-col gap-5">
      {lead && latestLead && latestLead.version > lead.version && (
        <div className="rounded-xl border border-line p-3 text-sm">
          <p>Este lead mudou enquanto você editava. Seu rascunho foi preservado.</p>
          <button
            type="button"
            className="mt-2 font-semibold underline"
            onClick={() => {
              setLead(latestLead);
              setSource(latestLead.source);
              setBand(latestLead.incomeBand);
              setStage(latestLead.stageKey);
              setError('');
            }}
          >
            Descartar rascunho e carregar dados atuais
          </button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3 4xl:grid-cols-4">
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
        <Field label="E-mail">
          {/* Texto com teclado de e-mail: quem valida é o schema, com a mensagem em português. */}
          <input
            className={control}
            name="email"
            defaultValue={lead?.email ?? ''}
            inputMode="email"
            maxLength={254}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>
        <Field label="Faixa de renda">
          <select
            className={control}
            name="incomeBand"
            value={band}
            onChange={(e) => {
              const next = e.target.value as IncomeBand;
              setBand(next);
              // Renda a descobrir: o lead fica em Criando Relacionamento (Igor, 10/11/2026).
              if (next === 'DESCOBRINDO') setStage(INCOME_DISCOVERY_STAGE);
            }}
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
          {/* Sem campo de envio: o perfil segue a faixa (5–8 mil P2, 8–15 mil P1, 15 mil+ P0). */}
          <output
            aria-live="polite"
            className={`${control} flex items-center gap-2 bg-transparent text-ink2`}
          >
            {tier ? (
              <>
                <span className={`tier tier-${tier}`}>{TIER_LABELS[tier]}</span>
                <span className="text-[13px]">pela faixa de renda</span>
              </>
            ) : (
              <span>Escolha a faixa de renda</span>
            )}
          </output>
        </Field>
        <Field label="Origem">
          <select
            className={control}
            name="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            required
          >
            <option value="" disabled>
              Escolha a origem
            </option>
            {LEAD_SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABELS[s]}
              </option>
            ))}
            {/* Origem antiga só aparece no lead que já está nela. */}
            {lead && isLegacyLeadSource(lead.source) && (
              <option value={lead.source}>{LEAD_SOURCE_LABELS[lead.source]}</option>
            )}
          </select>
        </Field>
        {source === 'OUTRO' && (
          <Field label="Qual origem?">
            <input
              className={control}
              name="sourceOther"
              defaultValue={lead?.sourceOther ?? ''}
              maxLength={SOURCE_OTHER_MAX}
              placeholder="Escreva a origem"
              autoComplete="off"
              autoFocus={lead?.source !== 'OUTRO'}
              // Lead antigo em "Outro" ficou sem texto: não trava a edição dos outros campos.
              required={!(lead?.source === 'OUTRO' && !lead.sourceOther)}
            />
          </Field>
        )}
        <Field label="Etapa">
          <select
            className={control}
            name="stageKey"
            value={stage}
            onChange={(e) => setStage(e.target.value)}
          >
            <StageOptions
              stages={catalog.stages}
              current={lead?.stageKey ?? 'SONDAGEM'}
              allowSale={!lead}
              incomeUnknown={band === 'DESCOBRINDO'}
            />
          </select>
        </Field>
        {sold ? (
          <SoldFields
            team={catalog.team}
            products={products}
            canRegister={can(me, 'sale:register')}
          />
        ) : (
          <StageFields
            key={stage}
            stage={stage}
            changed={changed}
            openMeeting={openMeeting}
            team={catalog.team}
            products={products}
            role={me.role}
            lead={lead}
          />
        )}
        {isLeader(me.role) && (
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
            {/* Na Venda Fechada o closer do lead é o da reunião. */}
            {!sold && (
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
            )}
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
