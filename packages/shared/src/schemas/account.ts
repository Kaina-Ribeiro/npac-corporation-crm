import { z } from 'zod';
import { ROLES } from '../enums.js';
import { PERFIS } from '../mentoria/enums.js';

/** Usuário de login: mesmo formato do plugin username do Better Auth, sempre minúsculo. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_.]{3,30}$/, 'Use 3 a 30 letras, números, ponto ou _');

/** Pedido de acesso feito na tela de login (a liderança aprova e escolhe o cargo). */
export const accessRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    username: usernameSchema,
    email: z.email().trim().toLowerCase().max(200),
    // Provisório enquanto o time testa: mínimo 3, igual ao auth.ts.
    password: z.string().min(3).max(128),
  })
  .strict();

/**
 * Campos do cargo (spec 2026-11-11-cargos-design): `role` + perfil do Acompanhamento + caixas da
 * liderança. Tudo passa pelo resolvedor (`resolverCargo`), que recusa as combinações sem sentido.
 */
const cargoCampos = {
  role: z.enum(ROLES),
  perfil: z.enum(PERFIS).optional(),
  moduloAdmin: z.boolean().optional(),
  canProspect: z.boolean().optional(),
  canClose: z.boolean().optional(),
};

/** Convite feito no Admin: a conta nasce com senha temporária e troca obrigatória. */
export const userInviteSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().trim().toLowerCase().max(200),
    username: usernameSchema,
    ...cargoCampos,
  })
  .strict();
export type UserInvite = z.output<typeof userInviteSchema>;

/** Troca no Admin: qualquer subconjunto; o cargo efetivo é o enviado ou o atual. */
export const userChangeSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    active: z.boolean(),
    ...cargoCampos,
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Informe alteração');
export type UserChange = z.output<typeof userChangeSchema>;

/** Aprovação de pedido de acesso: mesmo campo Cargo do convite. */
export const accessApprovalSchema = z.object(cargoCampos).strict();
export type AccessApproval = z.output<typeof accessApprovalSchema>;
