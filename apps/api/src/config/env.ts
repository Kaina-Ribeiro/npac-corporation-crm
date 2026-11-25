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
    /** Chave própria do Acompanhamento (cifra v2 com AAD); distinta da chave dos contatos. */
    MENTORADO_ENCRYPTION_KEY: key32('MENTORADO_ENCRYPTION_KEY'),
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
    /** Web Push (VAPID, base64url). Sem as duas chaves o push fica desligado; a tela continua avisando. */
    VAPID_PUBLIC_KEY: z.string().min(1).optional(),
    VAPID_PRIVATE_KEY: z.string().min(1).optional(),
    /** Contato do remetente exigido pelo Web Push (https: ou mailto:); padrão: WEB_ORIGIN. */
    VAPID_SUBJECT: z.string().min(1).optional(),
    /** Google Forms: sem o token a rota do webhook responde 404. */
    FORMS_WEBHOOK_TOKEN: z.string().min(32).optional(),
    /** Usuário dono dos leads criados pelo formulário. */
    FORMS_OWNER_USERNAME: z.string().min(1).optional(),
    /** Diretório da mídia do Acompanhamento (fora do banco). Obrigatório em produção. */
    MEDIA_DIR: z.string().min(1).optional(),
    /**
     * E-mail por SMTP (Gmail hoje; Resend, SES ou Brevo é só trocar as variáveis). Sem SMTP_HOST o
     * envio fica desligado e "Esqueci minha senha" manda pedir à liderança. 465 = TLS direto;
     * outra porta (587) negocia STARTTLS se o servidor oferecer.
     */
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(465),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASS: z.string().min(1).optional(),
    /** Remetente, ex.: `NPAC Corporation <npac.crm.sistema@gmail.com>` (no Gmail, o endereço da conta). */
    MAIL_FROM: z.string().min(3).optional(),
    /**
     * Avisos pelo Telegram (NPAC-74): token e nome do bot (do @BotFather) e o segredo que o Telegram
     * manda no cabeçalho do webhook. As três juntas; sem elas, desligado (seção some do perfil, 404).
     */
    TELEGRAM_BOT_TOKEN: z
      .string()
      .regex(/^\d+:[\w-]{30,}$/, 'TELEGRAM_BOT_TOKEN no formato do @BotFather (123:ABC…)')
      .optional(),
    TELEGRAM_BOT_USERNAME: z
      .string()
      .transform((v) => v.replace(/^@/, ''))
      .pipe(z.string().regex(/^\w{5,32}$/, 'TELEGRAM_BOT_USERNAME = o nome do bot, sem @'))
      .optional(),
    TELEGRAM_WEBHOOK_SECRET: z
      .string()
      .regex(
        /^[\w-]{32,256}$/,
        'TELEGRAM_WEBHOOK_SECRET: 32 a 256 caracteres A-Z, a-z, 0-9, _ ou -',
      )
      .optional(),
    /** Endereço da API do Telegram; só os testes trocam (servidor falso, nada sai da máquina). */
    TELEGRAM_API_URL: z.url().default('https://api.telegram.org'),
    /**
     * Tag que está no ar (`v0.25.0-rc`…), gravada no app pelo adaptador Cubeship do release-kit a
     * cada deploy (NPAC-77). Sem ela (local, e2e), o rodapé mostra "dev".
     */
    APP_VERSION: z.string().trim().max(64).optional(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  })
  .refine((e) => !e.MENTORADO_ENCRYPTION_KEY.equals(e.FIELD_ENCRYPTION_KEY), {
    message: 'MENTORADO_ENCRYPTION_KEY precisa ser distinta de FIELD_ENCRYPTION_KEY',
    path: ['MENTORADO_ENCRYPTION_KEY'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || !!e.MEDIA_DIR, {
    message: 'MEDIA_DIR é obrigatória em produção (diretório da mídia do Acompanhamento)',
    path: ['MEDIA_DIR'],
  })
  .refine((e) => !e.SMTP_HOST || !!e.MAIL_FROM, {
    message: 'MAIL_FROM é obrigatória com SMTP_HOST (remetente dos e-mails)',
    path: ['MAIL_FROM'],
  })
  .refine(
    (e) =>
      [e.TELEGRAM_BOT_TOKEN, e.TELEGRAM_BOT_USERNAME, e.TELEGRAM_WEBHOOK_SECRET].every((v) => !v) ||
      [e.TELEGRAM_BOT_TOKEN, e.TELEGRAM_BOT_USERNAME, e.TELEGRAM_WEBHOOK_SECRET].every((v) => !!v),
    {
      message:
        'TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME e TELEGRAM_WEBHOOK_SECRET vêm juntas (ou nenhuma)',
      path: ['TELEGRAM_BOT_TOKEN'],
    },
  )
  .refine(
    (e) =>
      e.TELEGRAM_API_URL.startsWith('https:') ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(e.TELEGRAM_API_URL),
    {
      // O token do bot vai no caminho da URL: fora da máquina, só por https.
      message: 'TELEGRAM_API_URL precisa ser https: (http só para localhost, nos testes)',
      path: ['TELEGRAM_API_URL'],
    },
  )
  .refine((e) => !e.SMTP_USER === !e.SMTP_PASS, {
    message: 'SMTP_USER e SMTP_PASS vêm juntas (ou nenhuma, para servidor sem login)',
    path: ['SMTP_PASS'],
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
