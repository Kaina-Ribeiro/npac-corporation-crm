'use client';
import {
  AREA_LABEL,
  AREAS,
  ATUA_COMO,
  CARGO_INFO,
  CARGOS,
  CARGOS_POR_AREA,
  MODULO_ADMIN_LABEL,
  temCaixas,
  type Cargo,
  type CargoPedido,
} from '@npac/shared/cargos';

/**
 * Campo Cargo (spec 2026-11-11-cargos-design), igual no Convidar, na Equipe e no pedido de acesso:
 * um `<select>` agrupado por área, as caixas "Atua como…" só para Head/Diretoria e o selo
 * "Admin do Acompanhamento" só para os cargos do módulo.
 */

/** Mesma regra da API: o Head só dá SDR e Closer; liderança e Acompanhamento, só a Diretoria. */
export const cargosQuePodeDar = (diretor: boolean): Cargo[] =>
  diretor ? [...CARGOS] : ['SDR', 'CLOSER'];

export type Extras = { canProspect: boolean; canClose: boolean; moduloAdmin: boolean };
export const SEM_EXTRAS: Extras = { canProspect: false, canClose: false, moduloAdmin: false };

/** Corpo que a API espera para o cargo escolhido: só os campos que esse cargo aceita. */
export function pedidoDoCargo(cargo: Cargo, extras: Extras): CargoPedido {
  const info = CARGO_INFO[cargo];
  if (info.perfil) return { role: info.role, perfil: info.perfil, moduloAdmin: extras.moduloAdmin };
  if (temCaixas(info.role))
    return { role: info.role, canProspect: extras.canProspect, canClose: extras.canClose };
  return { role: info.role };
}

export function CargoSelect({
  id,
  value,
  permitidos,
  onChange,
  className,
  ariaLabel,
}: {
  id?: string;
  /** `null`: conta antiga do Acompanhamento sem perfil, que precisa escolher. */
  value: Cargo | null;
  permitidos: Cargo[];
  onChange: (c: Cargo) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      className={className}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value as Cargo)}
    >
      {value === null && (
        <option value="" disabled>
          Escolha o perfil
        </option>
      )}
      {AREAS.map((area) => {
        const opcoes = CARGOS_POR_AREA[area].filter((c) => permitidos.includes(c));
        return opcoes.length ? (
          <optgroup key={area} label={AREA_LABEL[area]}>
            {opcoes.map((c) => (
              <option key={c} value={c}>
                {CARGO_INFO[c].label}
              </option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );
}

/** Dica do cargo escolhido, logo abaixo do campo. */
export function CargoDica({ cargo }: { cargo: Cargo | null }) {
  return (
    <p className="text-xs leading-snug font-normal text-ink2">
      {cargo ? CARGO_INFO[cargo].dica : 'Escolha o perfil do Acompanhamento para liberar o módulo.'}
    </p>
  );
}

/**
 * Opções que dependem do cargo: caixas da liderança ou selo do módulo. `compacto` = linha da
 * Equipe (dica no `title`); senão a dica fica visível ao lado.
 */
export function CargoExtras({
  cargo,
  value,
  onChange,
  nome,
  compacto = false,
}: {
  cargo: Cargo | null;
  value: Extras;
  onChange: (campo: keyof Extras, v: boolean) => void;
  /** Nome da pessoa, para os `aria-label` da Equipe e dos pedidos. */
  nome?: string;
  compacto?: boolean;
}) {
  if (!cargo) return null;
  const info = CARGO_INFO[cargo];
  const box = 'size-4 shrink-0 accent-[var(--ink)]';
  const item = (campo: keyof Extras, label: string, dica: string, role?: 'switch') => (
    <label
      key={campo}
      title={compacto ? dica : undefined}
      className="flex items-start gap-2 text-xs font-semibold text-ink"
    >
      <input
        type="checkbox"
        role={role}
        className={`${box} mt-px`}
        aria-label={nome ? `${label} para ${nome}` : undefined}
        checked={value[campo]}
        onChange={(e) => onChange(campo, e.target.checked)}
      />
      <span className="flex flex-col gap-0.5">
        {label}
        {!compacto && <span className="font-normal text-ink2">{dica}</span>}
      </span>
    </label>
  );
  if (temCaixas(info.role))
    return (
      <div className={compacto ? 'flex flex-wrap gap-3' : 'grid gap-2'}>
        {item('canProspect', ATUA_COMO.canProspect.label, ATUA_COMO.canProspect.dica)}
        {item('canClose', ATUA_COMO.canClose.label, ATUA_COMO.canClose.dica)}
      </div>
    );
  if (info.perfil)
    return item(
      'moduloAdmin',
      MODULO_ADMIN_LABEL,
      'Gerencia os perfis e as configurações do módulo.',
      'switch',
    );
  return null;
}
