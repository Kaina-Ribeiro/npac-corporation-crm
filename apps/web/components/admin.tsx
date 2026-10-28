'use client';
import type { Role } from '@npac/shared';
import { money, parseCents } from '@npac/shared/money';
import { useState, type FormEvent, type ReactNode } from 'react';
import { clientApi } from '@/lib/client-api';
import { button, control, Field, FormError, quietButton } from './crm-ui';

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  canProspect: boolean;
  canClose: boolean;
  active: boolean;
  twoFactorEnabled: boolean | null;
  mustChangePassword: boolean;
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
export type AdminData = { users: User[]; products: Product[]; stages: Stage[]; lgpd: Lgpd[] };

const TABS = ['Usuários', 'Produtos', 'Etapas', 'Auditoria', 'LGPD'] as const;
const ROLE_LABEL: Record<Role, string> = { HEAD: 'Head', SDR: 'SDR', CLOSER: 'Closer' };
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

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="glass-card flex flex-col gap-3 p-5">
      <h2 className="text-lg font-bold tracking-[-0.03em]">{title}</h2>
      {children}
    </section>
  );
}

/** Administração do HEAD; toda escrita é validada e auditada na API. */
export function Admin({ initial, meId }: { initial: AdminData; meId: string }) {
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
      const [users, products, stages, lgpd] = await Promise.all([
        clientApi<User[]>('/api/admin/users'),
        clientApi<Product[]>('/api/admin/products'),
        clientApi<Stage[]>('/api/admin/stages'),
        clientApi<Lgpd[]>('/api/admin/lgpd'),
      ]);
      setData({ users, products, stages, lgpd });
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

  const closers = data.users.filter((u) => u.active && u.canClose);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <h1 className="mt-1.5 text-[34px] leading-tight font-bold tracking-[-0.04em]">Admin</h1>
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
        <>
          <Card title="Convidar">
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                const form = e.currentTarget;
                void run(async () => {
                  const r = await clientApi('/api/admin/users', 'POST', {
                    name: String(f.get('name')),
                    email: String(f.get('email')),
                    role: String(f.get('role')),
                    canProspect: f.get('canProspect') === 'on',
                    canClose: f.get('canClose') === 'on',
                  });
                  form.reset();
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
              <Field label="Papel">
                <select name="role" className={control} defaultValue="SDR">
                  {(['SDR', 'CLOSER', 'HEAD'] as const).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="flex items-end gap-4 text-sm font-semibold">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="canProspect" /> Prospecta
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="canClose" /> Fecha
                </label>
              </div>
              <button className={`${button} sm:col-span-2 sm:justify-self-start`}>Convidar</button>
            </form>
          </Card>
          <Card title="Equipe">
            <ul className="divide-y divide-line">
              {data.users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-semibold">
                      {u.name} {!u.active && <span className="text-xs text-danger">inativo</span>}
                    </p>
                    <p className="text-xs text-ink2">
                      {u.email} · {ROLE_LABEL[u.role]}
                      {u.twoFactorEnabled ? ' · MFA ativo' : ''}
                    </p>
                  </div>
                  {u.id !== meId && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={quietButton}
                        onClick={() =>
                          void run(
                            () =>
                              clientApi(`/api/admin/users/${u.id}`, 'PATCH', { active: !u.active }),
                            u.active ? `${u.name} desativado` : `${u.name} reativado`,
                          )
                        }
                      >
                        {u.active ? 'Desativar' : 'Reativar'}
                      </button>
                      <button
                        type="button"
                        className={quietButton}
                        onClick={() =>
                          void run(async () => {
                            const r = await clientApi(
                              `/api/admin/users/${u.id}/reset-password`,
                              'POST',
                              {},
                            );
                            setTimeout(() => setNotice(temp(r)));
                          })
                        }
                      >
                        Nova senha
                      </button>
                      {u.twoFactorEnabled && (
                        <button
                          type="button"
                          className={quietButton}
                          onClick={() =>
                            void run(
                              () => clientApi(`/api/admin/users/${u.id}/reset-mfa`, 'POST', {}),
                              `MFA de ${u.name} redefinido`,
                            )
                          }
                        >
                          Resetar MFA
                        </button>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      {tab === 'Produtos' && (
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
          <form
            className="flex flex-wrap items-end gap-2 border-t border-line pt-3"
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
            <button className={button}>Criar produto</button>
          </form>
        </Card>
      )}

      {tab === 'Etapas' && (
        <Card title="Etapas do pipeline">
          <p className="text-xs text-ink2">
            O nome exibido pode mudar; a ordem e as regras (ex.: Venda) seguem a chave.
          </p>
          {data.stages.map((s) => (
            <form
              key={s.id}
              className="flex items-end gap-2"
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
        <>
          <Card title="Novo pedido do titular">
            <form
              className="grid gap-3 sm:grid-cols-2"
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
              <div className="sm:col-span-2">
                <Field label="Descrição (sem telefone ou documentos)">
                  <textarea name="description" className={control} required maxLength={2000} />
                </Field>
              </div>
              <button className={`${button} sm:justify-self-start`}>Registrar</button>
            </form>
          </Card>
          <Card title="Pedidos">
            {data.lgpd.length === 0 && <p className="text-sm text-ink2">Nenhum pedido.</p>}
            <ul className="divide-y divide-line">
              {data.lgpd.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 py-3">
                  <p className="font-semibold">
                    {KIND[r.kind]} · {r.status === 'OPEN' ? `prazo ${date(r.dueAt)}` : r.status}
                  </p>
                  <p className="text-sm text-ink2">{r.description}</p>
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
        </>
      )}
    </div>
  );
}
