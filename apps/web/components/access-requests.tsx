'use client';
import type { Cargo } from '@npac/shared/cargos';
import { useState } from 'react';
import { CargoDica, CargoExtras, CargoSelect, SEM_EXTRAS, type Extras } from './cargo-field';
import { button, control, quietButton } from './crm-ui';

export type AccessRequest = {
  id: string;
  name: string;
  username: string;
  email: string;
  createdAt: string;
};

const ago = (at: string) => {
  const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
  return days === 0 ? 'hoje' : days === 1 ? 'há 1 dia' : `há ${days} dias`;
};

/** Pedidos feitos na tela de login; some quando não há nenhum. */
export function AccessRequests({
  requests,
  cargos,
  onApprove,
  onReject,
}: {
  requests: AccessRequest[];
  /** Cargos que quem está logado pode dar (Head: SDR e Closer). */
  cargos: Cargo[];
  onApprove: (r: AccessRequest, cargo: Cargo, extras: Extras) => void;
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
          <Row key={r.id} request={r} cargos={cargos} onApprove={onApprove} onReject={onReject} />
        ))}
      </ul>
    </section>
  );
}

function Row({
  request: r,
  cargos,
  onApprove,
  onReject,
}: {
  request: AccessRequest;
  cargos: Cargo[];
  onApprove: (r: AccessRequest, cargo: Cargo, extras: Extras) => void;
  onReject: (r: AccessRequest) => void;
}) {
  // Mesmo campo do Convidar: o cargo define as caixas; nenhuma vem marcada.
  const [cargo, setCargo] = useState<Cargo>('SDR');
  const [extras, setExtras] = useState<Extras>(SEM_EXTRAS);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      {/* Base de 14rem: em telas estreitas os controles descem antes de cortar o nome. */}
      <span className="min-w-0 flex-[1_1_14rem]">
        <b className="block truncate font-semibold">{r.name}</b>
        <small className="block truncate text-sm text-ink2">
          {r.username} · {r.email} · {ago(r.createdAt)}
        </small>
      </span>
      <CargoSelect
        ariaLabel={`Cargo de ${r.name}`}
        className={`${control} sm:!w-44`}
        value={cargo}
        permitidos={cargos}
        onChange={(c) => {
          setCargo(c);
          setExtras(SEM_EXTRAS);
        }}
      />
      <button type="button" className={button} onClick={() => onApprove(r, cargo, extras)}>
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
      <div className="flex basis-full flex-col gap-2">
        <CargoDica cargo={cargo} />
        <CargoExtras
          compacto
          nome={r.name}
          cargo={cargo}
          value={extras}
          onChange={(campo, v) => setExtras((e) => ({ ...e, [campo]: v }))}
        />
      </div>
    </li>
  );
}
