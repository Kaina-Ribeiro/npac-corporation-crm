/** Cookie com o último usuário que entrou neste aparelho (só em /login; nunca em localStorage). */
export const LAST_USER_COOKIE = 'npac_last_user';

/**
 * Último usuário que entrou neste aparelho, para sugerir no campo. Fica num cookie restrito a
 * /login (não vai em nenhuma outra requisição) e fora do localStorage, como o resto do CRM.
 * Só no navegador.
 */
export function rememberUser(username: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${LAST_USER_COOKIE}=${encodeURIComponent(username)}; Path=/login; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function forgetUser() {
  document.cookie = `${LAST_USER_COOKIE}=; Path=/login; Max-Age=0; SameSite=Lax`;
}
