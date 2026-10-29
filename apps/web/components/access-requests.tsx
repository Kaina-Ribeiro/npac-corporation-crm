'use client';
import type { Role } from '@npac/shared';
import { useState } from 'react';
import { ROLE_LABEL } from './role-tag';
import { button, control, quietButton } from './crm-ui';

export type AccessRequest = {
  id: string;
  name: string;
  username: string;
  email: string;
  createdAt: string;
};
export type Approval = { role: Role; canProspect: boolean; canClose: boolean };

/** O cargo define o que a pessoa faz; liderança prospecta e fecha. */
const approvalFor = (role: Role): Approval => ({
  role,
  canProspect: role !== 'CLOSER',
  canClose: role !== 'SDR',
});

const ago = (at: string) => {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  return days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`;
};

/** Pedidos feitos na tela de login; some quando não há nenhum. */
export function AccessRequests({
  requests,
  roles,
  onApprove,
  onReject,
}: {
  requests: AccessRequest[];
  /** Cargos que quem está logado pode dar (Head: SDR e Closer). */
  roles: Role[];
  onApprove: (r: AccessRequest, approval: Approval) => void;
  onReject: (r: AccessRequest) => void;
}) {
  if (!requests.length) return null;
  return (
    <section
      aria-labelledby="access-requests"
      className="glass-card flex flex-col gap-3 p-5 ring-2 ring-gold/40"
    >
      <h2 id="access-requests" className="text-lg font-bold tracking-[-0.03em]">
        Pedidos de acesso
      </h2>
      <ul className="flex flex-col divide-y divide-line">
        {requests.map((r) => (
          <Row key={r.id} request={r} roles={roles} onApprove={onApprove} onReject={onReject} />
        ))}
      </ul>
    </section>
  );
}

function Row({
  request: r,
  roles,
  onApprove,
  onReject,
}: {
  request: AccessRequest;
  roles: Role[];
  onApprove: (r: AccessRequest, approval: Approval) => void;
  onReject: (r: AccessRequest) => void;
}) {
  const [role, setRole] = useState<Role>('SDR');
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <span className="min-w-0 flex-1">
        <b className="block truncate font-semibold">{r.name}</b>
        <small className="block truncate text-sm text-ink2">
          {r.username} · {r.email} · {ago(r.createdAt)}
        </small>
      </span>
      <select
        aria-label={`Cargo de ${r.name}`}
        className={`${control} w-auto`}
        value={role}
        onChange={(e) => setRole(e.target.value as Role)}
      >
        {roles.map((x) => (
          <option key={x} value={x}>
            {ROLE_LABEL[x]}
          </option>
        ))}
      </select>
      <button type="button" className={button} onClick={() => onApprove(r, approvalFor(role))}>
        Aprovar
      </button>
      <button
        type="button"
        className={quietButton}
        onClick={() => {
          if (confirm(`Recusar o pedido de ${r.name}?`)) onReject(r);
        }}
      >
        Recusar
      </button>
    </li>
  );
}
