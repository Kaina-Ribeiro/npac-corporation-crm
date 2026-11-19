/**
 * Lista de equipe por área (NPAC-54, Fase 3): a linha de `GET admin/users`, lida no Admin do CRM e
 * na aba Perfis do módulo. Sem 'use client': a página do servidor também usa.
 */
import type { Role } from '@npac/shared';
import type { ContaAreas, Vinculo } from '@npac/shared/areas';
import type { Perfil } from '@npac/shared/mentoria';

export type ContaEquipe = {
  id: string;
  name: string;
  /** Foto do perfil (NPAC-53), ou null. */
  photo: string | null;
  email: string;
  username: string | null;
  role: Role;
  canProspect: boolean;
  canClose: boolean;
  /** Perfil do Acompanhamento (nulo fora dele ou "falta perfil"). */
  perfil: Perfil | null;
  moduloAdmin: boolean | null;
  active: boolean;
  twoFactorEnabled: boolean | null;
  mustChangePassword: boolean;
  /** Leads abertos em nome da pessoa (como SDR). */
  leads: number;
  mestre: boolean;
  /** Vínculos que quem lê enxerga (o Head, só os da área dele). */
  areas: Vinculo[];
  /** A pessoa também está em outra área que quem lê não gerencia. */
  outraArea: boolean;
  /** Última vez que usou o sistema ("entrou há X", D12), ou null. */
  ultimoUso: string | null;
};

/**
 * A conta como a regra única a vê: em `outraArea` o Head não sabe o cargo da outra área, mas
 * sabe que existe (é o que barra senha e desativar, M5).
 */
export function contaDaRegra(c: ContaEquipe): ContaAreas {
  const areas = [...c.areas];
  if (c.outraArea) {
    const outra = areas.some((a) => a.area === 'COMERCIAL') ? 'ACOMPANHAMENTO' : 'COMERCIAL';
    areas.push({ area: outra, cargo: null, head: false });
  }
  return { mestre: c.mestre, areas };
}
