'use client';
import type { Role } from '@npac/shared';
import {
  ATUA_COMO,
  cargoDe,
  CARGO_INFO,
  MODULO_ADMIN_LABEL,
  temCaixas,
  type Cargo,
} from '@npac/shared/cargos';
import { isLeader } from '@npac/shared/enums';
import type { Perfil } from '@npac/shared/mentoria';
import { money, parseCents } from '@npac/shared/money';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { clientApi } from '@/lib/client-api';
import { AccessRequests, type AccessRequest } from './access-requests';
import {
  CargoDica,
  CargoExtras,
  CargoSelect,
  cargosQuePodeDar,
  pedidoDoCargo,
  SEM_EXTRAS,
  type Extras,
} from './cargo-field';
import { CargoTag } from './role-tag';
import { button, control, Field, FormError, quietButton } from './crm-ui';

type User = {
  id: string;
  name: string;
  email: string;
  username: string | null;
  role: Role;
  canProspect: boolean;
  canClose: boolean;
  /** Perfil do Acompanhamento: só vem para a Diretoria (para o Head, `null`). */
  perfil: Perfil | null;
  moduloAdmin: boolean | null;
  active: boolean;
  twoFactorEnabled: boolean | null;
  mustChangePassword: boolean;
  /** Leads abertos em nome da pessoa (como SDR). */
  leads: number;
};
type Product = {
  id: string;
  code: string;
  name: string;
  closerId: string;
  closerName: string;
  priceCents: number;
  active: boolean;
};
type Stage = { id: string; key: string; label: string; position: number };
type Lgpd = {
  id: string;
  kind: 'ACCESS' | 'CORRECTION' | 'DELETION';
  status: 'OPEN' | 'DONE' | 'REJECTED';
  leadId: string | null;
  description: string;
  resolution: string | null;
  createdAt: string;
  dueAt: string;
  createdByName: string;
};
type AuditItem = {
  id: number;
  at: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorName: string | null;
};
export type AdminData = {
  users: User[];
  products: Product[];
  stages: Stage[];
  lgpd: Lgpd[];
  requests: AccessRequest[];
};

const TABS = ['Usuários', 'Produtos', 'Etapas', 'Auditoria', 'LGPD'] as const;
const KIND: Record<Lgpd['kind'], string> = {
  ACCESS: 'Acesso',
  CORRECTION: 'Correção',
  DELETION: 'Eliminação',
};
const date = (at: string) =>
  new Date(at).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });

/** Coluna lateral (formulário) + conteúdo principal; empilha abaixo de xl. */
const split =
  'grid items-start gap-5 xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] 4xl:grid-cols-[460px_minmax(0,1fr)]';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    // @container: o formulário escolhe 1 ou 2 colunas pela largura do card, não da tela.
    <section className="glass-card @container flex min-w-0 flex-col gap-3 p-5">
      <h2 className="text-lg font-bold tracking-[-0.03em]">{title}</h2>
      {children}
    </section>
  );
}

/** Mensagem de sucesso das caixas: "Ana agora atua como SDR", "…não é mais Admin do Acompanhamento". */
function avisoDaCaixa(nome: string, campo: keyof Extras, on: boolean) {
  if (campo === 'moduloAdmin')
    return `${nome} ${on ? 'agora é' : 'não é mais'} ${MODULO_ADMIN_LABEL}`;
  const papel = ATUA_COMO[campo].label.replace('Atua como ', '');
  return `${nome} ${on ? 'agora atua' : 'não atua mais'} como ${papel}`;
}

/** Administração da liderança; toda escrita é validada e auditada na API. */
export function Admin({
  initial,
  meId,
  meRole,
}: {
  initial: AdminData;
  meId: string;
  meRole: Role;
}) {
  // Mesma regra da API: só a Diretoria dá cargo de liderança ou mexe em conta de Head/Diretoria.
  // Acompanhamento lê dados sensíveis de mentorados: também só a Diretoria concede (D10).
  const diretor = meRole === 'DIRETOR';
  const cargos = cargosQuePodeDar(diretor);
  const [convite, setConvite] = useState<{ cargo: Cargo; extras: Extras }>({
    cargo: 'SDR',
    extras: SEM_EXTRAS,
  });
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>('Usuários');
  const [data, setData] = useState(initial);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [audit, setAudit] = useState<{ items: AuditItem[]; page: number; hasMore: boolean }>();

  async function run(fn: () => Promise<unknown>, done?: string) {
    setError(undefined);
    setNotice(undefined);
    try {
      await fn();
      const [users, products, stages, lgpd, requests] = await Promise.all([
        clientApi<User[]>('/api/admin/users'),
        clientApi<Product[]>('/api/admin/products'),
        clientApi<Stage[]>('/api/admin/stages'),
        clientApi<Lgpd[]>('/api/admin/lgpd'),
        clientApi<AccessRequest[]>('/api/admin/access-requests'),
      ]);
      setData({ users, products, stages, lgpd, requests });
      // Contador de pedidos no item Admin da navegação.
      if (requests.length !== data.requests.length) router.refresh();
      if (done) setNotice(done);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const temp = (r: unknown) =>
    `Senha temporária (mostrada uma única vez): ${(r as { temporaryPassword: string }).temporaryPassword}`;

  async function loadAudit(page: number, action?: string) {
    try {
      setAudit(
        await clientApi('/api/admin/audit/search', 'POST', { page, ...(action ? { action } : {}) }),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }

  /** Head só altera SDR e Closer; liderança e Acompanhamento, só a Diretoria. */
  const podeAlterar = (u: User) => diretor || (!isLeader(u.role) && u.role !== 'ACOMPANHAMENTO');
  /** Regra 8 do spec: trocar não bloqueia, mas lembra de passar os leads. */
  const confirmarLeads = (u: User) =>
    u.leads === 0 ||
    confirm(
      `${u.name} tem ${u.leads} ${u.leads === 1 ? 'lead' : 'leads'}. Depois, passe em "Passar leads para…".`,
    );
  const closers = data.users.filter((u) => u.active && u.canClose);
  const sdrs = data.users.filter((u) => u.active && u.canProspect);

  return (
    <div className="flex w-full flex-col gap-5">
      <h1 className="mt-1.5 text-[34px] leading-tight font-bold tracking-[-0.04em]">Admin</h1>
      <AccessRequests
        requests={data.requests}
        cargos={cargos}
        onApprove={(r, cargo, extras) =>
          void run(
            () =>
              clientApi(
                `/api/admin/access-requests/${r.id}/approve`,
                'POST',
                pedidoDoCargo(cargo, extras),
              ),
            `${r.name} aprovado como ${CARGO_INFO[cargo].label}.`,
          )
        }
        onReject={(r) =>
          void run(
            () => clientApi(`/api/admin/access-requests/${r.id}`, 'DELETE'),
            `Pedido de ${r.name} recusado.`,
          )
        }
      />
      <div role="tablist" aria-label="Seções do admin" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            className={tab === t ? button : quietButton}
            onClick={() => {
              setTab(t);
              if (t === 'Auditoria' && !audit) void loadAudit(1);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <FormError message={error} />
      {notice && (
        <p role="status" className="rounded-xl bg-gold/20 p-3 text-sm font-semibold break-all">
          {notice}
        </p>
      )}

      {tab === 'Usuários' && (
        <div className={split}>
          <div className="xl:sticky xl:top-6">
            <Card title="Convidar">
              <form
                className="grid gap-3 @lg:grid-cols-2"
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const form = e.currentTarget;
                  void run(async () => {
                    const r = await clientApi('/api/admin/users', 'POST', {
                      name: String(f.get('name')),
                      email: String(f.get('email')),
                      username: String(f.get('username')).trim().toLowerCase(),
                      ...pedidoDoCargo(convite.cargo, convite.extras),
                    });
                    form.reset();
                    setConvite({ cargo: 'SDR', extras: SEM_EXTRAS });
                    setTimeout(() => setNotice(temp(r)));
                  });
                }}
              >
                <Field label="Nome">
                  <input name="name" className={control} required maxLength={120} />
                </Field>
                <Field label="E-mail">
                  <input name="email" type="email" className={control} required />
                </Field>
                <Field label="Usuário">
                  <input
                    name="username"
                    className={control}
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[a-zA-Z0-9_.]+"
                    title="3 a 30 letras, números, ponto ou _"
                    placeholder="ex.: maria.silva"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </Field>
                <div className="flex flex-col gap-2 @lg:col-span-2">
                  <Field label="Cargo">
                    <CargoSelect
                      className={control}
                      value={convite.cargo}
                      permitidos={cargos}
                      onChange={(cargo) => setConvite({ cargo, extras: SEM_EXTRAS })}
                    />
                  </Field>
                  <CargoDica cargo={convite.cargo} />
                  <CargoExtras
                    cargo={convite.cargo}
                    value={convite.extras}
                    onChange={(campo, v) =>
                      setConvite((c) => ({ ...c, extras: { ...c.extras, [campo]: v } }))
                    }
                  />
                </div>
                <button className={`${button} @lg:col-span-2 @lg:justify-self-start`}>
                  Convidar
                </button>
              </form>
            </Card>
          </div>
          <Card title="Equipe">
            <ul className="divide-y divide-line">
              {data.users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {u.name}{' '}
                      <CargoTag
                        role={u.role}
                        perfil={u.perfil}
                        moduloAdmin={u.moduloAdmin}
                        faltaPerfil={diretor && u.role === 'ACOMPANHAMENTO' && !u.perfil}
                      />
                      {!u.active && <span className="text-xs text-danger">inativo</span>}
                    </p>
                    <p className="text-xs text-ink2">
                      {u.username && <b className="font-semibold text-ink">{u.username} · </b>}
                      {u.email}
                      {u.twoFactorEnabled ? ' · MFA ativo' : ''}
                      {u.leads > 0 && ` · ${u.leads} ${u.leads === 1 ? 'lead' : 'leads'}`}
                    </p>
                  </div>
                  {u.id !== meId && !podeAlterar(u) && (
                    <p className="text-xs text-ink3">Só a Diretoria altera esta conta</p>
                  )}
                  {u.id !== meId && podeAlterar(u) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* SDR, Closer e Acompanhamento não têm caixa: o cargo define (C4). */}
                      <CargoExtras
                        compacto
                        nome={u.name}
                        cargo={cargoDe(u.role, u.perfil)}
                        value={{
                          canProspect: u.canProspect,
                          canClose: u.canClose,
                          moduloAdmin: u.moduloAdmin ?? false,
                        }}
                        onChange={(campo, on) => {
                          if (campo === 'canProspect' && !on && !confirmarLeads(u)) return;
                          // Otimista: a caixa responde na hora e volta se a API recusar.
                          const show = (v: boolean) =>
                            setData((d) => ({
                              ...d,
                              users: d.users.map((x) => (x.id === u.id ? { ...x, [campo]: v } : x)),
                            }));
                          show(on);
                          void run(
                            () =>
                              clientApi(`/api/admin/users/${u.id}`, 'PATCH', {
                                [campo]: on,
                              }).catch((err: unknown) => {
                                show(!on);
                                throw err;
                              }),
                            avisoDaCaixa(u.name, campo, on),
                          );
                        }}
                      />
                      <CargoSelect
                        ariaLabel={`Cargo de ${u.name}`}
                        value={cargoDe(u.role, u.perfil)}
                        permitidos={cargos}
                        className={`${quietButton} bg-transparent`}
                        onChange={(cargo) => {
                          const info = CARGO_INFO[cargo];
                          if (
                            isLeader(info.role) &&
                            !confirm(`Dar cargo de ${info.label} para ${u.name}?`)
                          )
                            return;
                          if (
                            info.perfil &&
                            u.role !== 'ACOMPANHAMENTO' &&
                            !confirm(
                              `Dar o cargo ${info.label} para ${u.name}? Esse cargo lê dados sensíveis de mentorados.`,
                            )
                          )
                            return;
                          // Quem deixa de atuar como SDR fica com os leads (a liderança vê); avisa.
                          const atuaSdr =
                            info.role === 'SDR' || (temCaixas(info.role) && u.canProspect);
                          if (!atuaSdr && !confirmarLeads(u)) return;
                          void run(
                            () =>
                              clientApi(
                                `/api/admin/users/${u.id}`,
                                'PATCH',
                                info.perfil
                                  ? { role: info.role, perfil: info.perfil }
                                  : { role: info.role },
                              ),
                            `${u.name} agora é ${info.label}`,
                          );
                        }}
                      />
                      <button
                        type="button"
                        className={quietButton}
                        onClick={() => {
                          if (
                            u.active &&
                            !confirm(
                              `Desativar ${u.name}? A pessoa sai na hora.` +
                                (u.leads
                                  ? ` Depois, passe os ${u.leads} lead(s) dela em "Passar leads para…".`
                                  : ''),
                            )
                          )
                            return;
                          void run(
                            () =>
                              clientApi(`/api/admin/users/${u.id}`, 'PATCH', { active: !u.active }),
                            u.active ? `${u.name} desativado` : `${u.name} reativado`,
                          );
                        }}
                      >
                        {u.active ? 'Desativar' : 'Reativar'}
                      </button>
                      <button
                        type="button"
                        className={quietButton}
                        onClick={() => {
                          // A senha atual para de valer na hora e a pessoa é desconectada.
                          if (
                            !confirm(
                              `Gerar nova senha para ${u.name}? A senha atual deixa de valer.`,
                            )
                          )
                            return;
                          void run(async () => {
                            const r = await clientApi(
                              `/api/admin/users/${u.id}/reset-password`,
                              'POST',
                              {},
                            );
                            setTimeout(() => setNotice(temp(r)));
                          });
                        }}
                      >
                        Nova senha
                      </button>
                      {u.twoFactorEnabled && (
                        <button
                          type="button"
                          className={quietButton}
                          onClick={() => {
                            if (
                              !confirm(
                                `Resetar o MFA de ${u.name}? Será preciso configurar o app de novo.`,
                              )
                            )
                              return;
                            void run(
                              () => clientApi(`/api/admin/users/${u.id}/reset-mfa`, 'POST', {}),
                              `MFA de ${u.name} redefinido`,
                            );
                          }}
                        >
                          Resetar MFA
                        </button>
                      )}
                      {u.leads > 0 && (
                        <select
                          aria-label={`Passar leads de ${u.name}`}
                          value=""
                          className={`${quietButton} bg-transparent`}
                          onChange={(e) => {
                            const to = sdrs.find((s) => s.id === e.target.value);
                            if (
                              !to ||
                              !confirm(`Passar ${u.leads} lead(s) de ${u.name} para ${to.name}?`)
                            )
                              return;
                            void run(
                              () =>
                                clientApi(`/api/admin/users/${u.id}/transfer-leads`, 'POST', {
                                  to: to.id,
                                }),
                              `Leads de ${u.name} agora são de ${to.name}`,
                            );
                          }}
                        >
                          <option value="">Passar leads para…</option>
                          {sdrs
                            .filter((s) => s.id !== u.id)
                            .map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {tab === 'Produtos' && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,400px)] 4xl:grid-cols-[minmax(0,1fr)_460px]">
          <Card title="Produtos e preços">
            <p className="text-xs text-ink2">
              Vendas antigas guardam nome e preço da época; mudar o catálogo não as altera.
            </p>
            <ul className="divide-y divide-line">
              {data.products.map((p) => (
                <li key={p.id} className="py-3">
                  <form
                    className="flex flex-wrap items-end gap-2"
                    aria-label={`Produto ${p.name}`}
                    onSubmit={(e: FormEvent<HTMLFormElement>) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void run(
                        () =>
                          clientApi(`/api/admin/products/${p.id}`, 'PATCH', {
                            name: String(f.get('name')),
                            priceCents: parseCents(String(f.get('price'))),
                            closerId: String(f.get('closerId')),
                          }),
                        `${p.name} atualizado`,
                      );
                    }}
                  >
                    <Field label="Nome">
                      <input name="name" className={control} defaultValue={p.name} required />
                    </Field>
                    <Field label="Preço (R$)">
                      <input
                        name="price"
                        className={control}
                        inputMode="decimal"
                        defaultValue={(p.priceCents / 100).toFixed(2).replace('.', ',')}
                        required
                      />
                    </Field>
                    <Field label="Closer">
                      <select name="closerId" className={control} defaultValue={p.closerId}>
                        {closers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <button className={quietButton}>Salvar</button>
                    <button
                      type="button"
                      className={quietButton}
                      onClick={() =>
                        void run(() =>
                          clientApi(`/api/admin/products/${p.id}`, 'PATCH', { active: !p.active }),
                        )
                      }
                    >
                      {p.active ? 'Desativar' : 'Reativar'}
                    </button>
                    <span className="pb-2 text-xs text-ink2">
                      {p.code} · {money(p.priceCents)}
                      {!p.active && ' · inativo'}
                    </span>
                  </form>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Novo produto">
            <form
              className="grid gap-3 @lg:grid-cols-2"
              aria-label="Novo produto"
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const form = e.currentTarget;
                void run(async () => {
                  await clientApi('/api/admin/products', 'POST', {
                    code: String(f.get('code')).toUpperCase(),
                    name: String(f.get('name')),
                    priceCents: parseCents(String(f.get('price'))),
                    closerId: String(f.get('closerId')),
                  });
                  form.reset();
                }, 'Produto criado');
              }}
            >
              <Field label="Código">
                <input name="code" className={control} required pattern="[A-Za-z0-9_]{2,40}" />
              </Field>
              <Field label="Nome">
                <input name="name" className={control} required />
              </Field>
              <Field label="Preço (R$)">
                <input name="price" className={control} inputMode="decimal" required />
              </Field>
              <Field label="Closer">
                <select name="closerId" className={control}>
                  {closers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button className={`${button} @lg:col-span-2 @lg:justify-self-start`}>
                Criar produto
              </button>
            </form>
          </Card>
        </div>
      )}

      {tab === 'Etapas' && (
        <Card title="Etapas do pipeline">
          <p className="text-xs text-ink2">
            O nome exibido pode mudar; a ordem e as regras (ex.: Venda) seguem a chave.
          </p>
          <div className="grid gap-x-6 gap-y-3 md:grid-cols-2 2xl:grid-cols-3 4xl:grid-cols-4">
            {data.stages.map((s) => (
              <form
                key={s.id}
                className="flex items-end gap-2 [&>div]:flex-1"
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  const label = String(new FormData(e.currentTarget).get('label'));
                  void run(
                    () => clientApi(`/api/admin/stages/${s.id}`, 'PATCH', { label }),
                    'Etapa renomeada',
                  );
                }}
              >
                <Field label={`${s.position}. ${s.key}`}>
                  <input name="label" className={control} defaultValue={s.label} required />
                </Field>
                <button className={quietButton}>Salvar</button>
              </form>
            ))}
          </div>
        </Card>
      )}

      {tab === 'Auditoria' && (
        <Card title="Log de auditoria">
          <form
            className="flex items-end gap-2"
            onSubmit={(e: FormEvent<HTMLFormElement>) => {
              e.preventDefault();
              void loadAudit(1, String(new FormData(e.currentTarget).get('action') || ''));
            }}
          >
            <Field label="Ação">
              <input name="action" className={control} placeholder="ex.: lead.view" />
            </Field>
            <button className={quietButton}>Filtrar</button>
          </form>
          <ol className="divide-y divide-line text-sm">
            {audit?.items.map((i) => (
              <li key={i.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="font-mono">{i.action}</span>
                <span className="text-ink2">
                  {i.actorName ?? 'sistema'} · {i.entityType}
                  {i.entityId ? ` ${i.entityId.slice(0, 8)}` : ''} · {date(i.at)}
                </span>
              </li>
            ))}
          </ol>
          {audit && (
            <div className="flex gap-2">
              <button
                type="button"
                className={quietButton}
                disabled={audit.page <= 1}
                onClick={() => void loadAudit(audit.page - 1)}
              >
                Anterior
              </button>
              <button
                type="button"
                className={quietButton}
                disabled={!audit.hasMore}
                onClick={() => void loadAudit(audit.page + 1)}
              >
                Próxima
              </button>
            </div>
          )}
        </Card>
      )}

      {tab === 'LGPD' && (
        <div className={split}>
          <div className="xl:sticky xl:top-6">
            <Card title="Novo pedido do titular">
              <form
                className="grid gap-3 @lg:grid-cols-2"
                onSubmit={(e: FormEvent<HTMLFormElement>) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const form = e.currentTarget;
                  const leadId = String(f.get('leadId') ?? '').trim();
                  void run(async () => {
                    await clientApi('/api/admin/lgpd', 'POST', {
                      kind: String(f.get('kind')),
                      description: String(f.get('description')),
                      ...(leadId ? { leadId } : {}),
                    });
                    form.reset();
                  }, 'Pedido registrado; prazo de 15 dias');
                }}
              >
                <Field label="Tipo">
                  <select name="kind" className={control}>
                    {Object.entries(KIND).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="ID do lead (copie da ficha)">
                  <input name="leadId" className={control} pattern="[0-9a-fA-F-]{36}" />
                </Field>
                <div className="@lg:col-span-2">
                  <Field label="Descrição (sem telefone ou documentos)">
                    <textarea name="description" className={control} required maxLength={2000} />
                  </Field>
                </div>
                <button className={`${button} @lg:justify-self-start`}>Registrar</button>
              </form>
            </Card>
          </div>
          <Card title="Pedidos">
            {data.lgpd.length === 0 && <p className="text-sm text-ink2">Nenhum pedido.</p>}
            <ul className="divide-y divide-line">
              {data.lgpd.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 py-3">
                  <p className="font-semibold">
                    {KIND[r.kind]} · {r.status === 'OPEN' ? `prazo ${date(r.dueAt)}` : r.status}
                  </p>
                  <p className="max-w-prose text-sm text-ink2">{r.description}</p>
                  {r.resolution && <p className="text-sm">Resposta: {r.resolution}</p>}
                  <div className="flex flex-wrap gap-2">
                    {r.leadId && r.kind === 'ACCESS' && (
                      <a className={quietButton} href={`/api/admin/lgpd/${r.id}/export`} download>
                        Exportar dados
                      </a>
                    )}
                    {r.status === 'OPEN' &&
                      (['DONE', 'REJECTED'] as const).map((status) => (
                        <button
                          key={status}
                          type="button"
                          className={quietButton}
                          onClick={() => {
                            const resolution = window.prompt(
                              status === 'DONE'
                                ? r.kind === 'DELETION'
                                  ? 'Concluir anonimiza o titular de forma irreversível. Resposta ao titular:'
                                  : 'Resposta ao titular:'
                                : 'Motivo da recusa:',
                            );
                            if (resolution)
                              void run(
                                () =>
                                  clientApi(`/api/admin/lgpd/${r.id}/resolve`, 'POST', {
                                    status,
                                    resolution,
                                  }),
                                'Pedido encerrado',
                              );
                          }}
                        >
                          {status === 'DONE' ? 'Concluir' : 'Recusar'}
                        </button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
