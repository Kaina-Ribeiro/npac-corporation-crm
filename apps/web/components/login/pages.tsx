import 'server-only';
import type { AccessArea } from '@npac/shared/enums';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { LAST_USER_COOKIE } from '@/lib/last-user';
import { getSession } from '@/lib/session';
import { LOGIN_AREA, validLastUser } from './area';
import { AuthShell } from './auth-shell';
import { ForgotPasswordForm } from './forgot-password-form';
import { LoginForm } from './login-form';
import { RequestAccessForm } from './request-access-form';

/**
 * As telas de entrada de cada área (NPAC-51): `/login…` (CRM) e `/login/acompanhamento…` usam as
 * mesmas páginas; muda só a aparência, os textos e para onde o login leva.
 */
async function lastUser() {
  // Gravado pelo próprio formulário após um login bem-sucedido neste aparelho (Path=/login).
  return validLastUser((await cookies()).get(LAST_USER_COOKIE)?.value);
}

/** Quem já está logado segue para a área da tela. */
async function semSessao(area: AccessArea) {
  if (await getSession()) redirect(LOGIN_AREA[area].destino);
}

export async function LoginPage({ area }: { area: AccessArea }) {
  await semSessao(area);
  return (
    <AuthShell area={area} outraTela>
      <LoginForm lastUser={await lastUser()} area={area} />
    </AuthShell>
  );
}

export async function RequestAccessPage({ area }: { area: AccessArea }) {
  await semSessao(area);
  return (
    <AuthShell area={area}>
      <RequestAccessForm area={area} />
    </AuthShell>
  );
}

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/** A API diz se há envio de e-mail; sem ele (ou sem resposta), segue o caminho da liderança. */
async function mailEnabled(): Promise<boolean> {
  const res = await fetch(`${API}/api/auth/forgot-password/status`, { cache: 'no-store' }).catch(
    () => null,
  );
  const body = (await res?.json().catch(() => null)) as { enabled?: boolean } | null;
  return body?.enabled === true;
}

export async function ForgotPasswordPage({ area }: { area: AccessArea }) {
  await semSessao(area);
  return (
    <AuthShell area={area}>
      <ForgotPasswordForm enabled={await mailEnabled()} lastUser={await lastUser()} area={area} />
    </AuthShell>
  );
}
