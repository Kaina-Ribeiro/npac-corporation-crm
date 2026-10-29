import { z } from 'zod';

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
