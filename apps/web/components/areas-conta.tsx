'use client';
import {
  AREA_LABEL,
  AREAS,
  CARGO_INFO,
  CARGOS_POR_AREA,
  type Area,
  type Cargo,
} from '@npac/shared/cargos';
import type { Vinculo } from '@npac/shared/areas';
import { CargoExtras, CargoSelect, SEM_EXTRAS } from './cargo-field';

/**
 * Pessoa em duas áreas (NPAC-54, Fase 4), na linha da Equipe da Diretoria: "Adicionar a outra área"
 * abre o campo Cargo só com os cargos da área que falta; numa conta com as duas áreas, um campo
 * Cargo por área e "Tirar de uma área". Tudo pela rota por área (`PUT`/`DELETE
 * admin/users/:id/areas/:area`), que só a Diretoria usa.
 */

/** Cargos que a rota por área aceita (a Diretoria não é cargo de área). */
const cargosDa = (area: Area): Cargo[] => CARGOS_POR_AREA[area].filter((c) => c !== 'DIRETOR');

export type MudancaDeArea =
  { tipo: 'definir'; area: Area; cargo: Cargo; head?: boolean } | { tipo: 'tirar'; area: Area };

/** O que vai para a API e a frase de sucesso (textos a confirmar com o Gabriel, Fase 4). */
export function pedidoDeArea(nome: string, m: MudancaDeArea, nova: boolean) {
  if (m.tipo === 'tirar')
    return {
      metodo: 'DELETE' as const,
      corpo: {},
      confirmar: `Tirar ${nome} do ${AREA_LABEL[m.area]}?`,
      aviso: `${nome} saiu do ${AREA_LABEL[m.area]}`,
    };
  const label = CARGO_INFO[m.cargo].label;
  const sensivel =
    m.area === 'ACOMPANHAMENTO' ? ' Esse cargo lê dados sensíveis de mentorados.' : '';
  return {
    metodo: 'PUT' as const,
    corpo: m.head === undefined ? { cargo: m.cargo } : { cargo: m.cargo, head: m.head },
    confirmar: nova ? `Adicionar ${nome} ao ${AREA_LABEL[m.area]} como ${label}?${sensivel}` : null,
    aviso: nova ? `${nome} agora também é ${label}` : `${nome} agora é ${label}`,
  };
}

/** "Adicionar a outra área": um select com o rótulo como primeira opção (como "Passar leads para…"). */
export function AdicionarArea({
  nome,
  areas,
  className,
  onEscolher,
}: {
  nome: string;
  areas: Vinculo[];
  className?: string;
  onEscolher: (m: MudancaDeArea) => void;
}) {
  const falta = AREAS.find((a) => !areas.some((v) => v.area === a));
  if (!falta) return null;
  return (
    <select
      aria-label={`Adicionar ${nome} a outra área`}
      value=""
      className={className}
      onChange={(e) => {
        const cargo = e.target.value as Cargo;
        if (cargo) onEscolher({ tipo: 'definir', area: falta, cargo });
      }}
    >
      <option value="">Adicionar a outra área</option>
      <optgroup label={AREA_LABEL[falta]}>
        {cargosDa(falta).map((c) => (
          <option key={c} value={c}>
            {CARGO_INFO[c].label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

/** Conta com as duas áreas: um campo Cargo por área, o selo do módulo e "Tirar de uma área". */
export function CargosPorArea({
  nome,
  areas,
  className,
  onMudar,
}: {
  nome: string;
  areas: Vinculo[];
  className?: string;
  onMudar: (m: MudancaDeArea) => void;
}) {
  return (
    <>
      {AREAS.map((area) => {
        const v = areas.find((x) => x.area === area);
        if (!v) return null;
        const cargo = (v.cargo as Cargo | null) ?? null;
        return (
          <span key={area} className="flex flex-wrap items-center gap-2">
            {area === 'ACOMPANHAMENTO' && (
              <CargoExtras
                compacto
                nome={nome}
                cargo={cargo}
                value={{ ...SEM_EXTRAS, moduloAdmin: v.head }}
                onChange={(_, on) => cargo && onMudar({ tipo: 'definir', area, cargo, head: on })}
              />
            )}
            <CargoSelect
              ariaLabel={`Cargo de ${nome} no ${AREA_LABEL[area]}`}
              value={cargo}
              permitidos={cargosDa(area)}
              className={className}
              onChange={(c) => onMudar({ tipo: 'definir', area, cargo: c })}
            />
          </span>
        );
      })}
      <select
        aria-label={`Tirar ${nome} de uma área`}
        value=""
        className={className}
        onChange={(e) => {
          const area = e.target.value as Area;
          if (area) onMudar({ tipo: 'tirar', area });
        }}
      >
        <option value="">Tirar de uma área</option>
        {AREAS.map((a) => (
          <option key={a} value={a}>
            {AREA_LABEL[a]}
          </option>
        ))}
      </select>
    </>
  );
}
