import { z } from 'zod';

const key32 = (name: string) =>
  z
    .string({ error: `${name} é obrigatória` })
    .transform((v) => Buffer.from(v, 'base64'))
    .refine((b) => b.length === 32, `${name} precisa decodificar (base64) para 32 bytes`);

const envSchema = z
  .object({
    APP_DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    FIELD_ENCRYPTION_KEY: key32('FIELD_ENCRYPTION_KEY'),
    BLIND_INDEX_KEY: key32('BLIND_INDEX_KEY'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    WEB_ORIGIN: z.url(),
    /** Origens adicionais aceitas no login (ex.: túnel de teste), separadas por vírgula. */
    EXTRA_TRUSTED_ORIGINS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.url())),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** MFA obrigatório para HEAD. Só pode ser desligado fora de produção (testes locais). */
    MFA_REQUIRED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  .refine((e) => e.MFA_REQUIRED || e.NODE_ENV !== 'production', {
    message: 'MFA_REQUIRED não pode ser false em produção',
    path: ['MFA_REQUIRED'],
  });

export type Env = z.infer<typeof envSchema>;

/** Valida o ambiente na subida; qualquer chave ausente ou inválida derruba o processo. */
export function loadEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Configuração inválida:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
