'use client';

/**
 * Senha recém-criada no primeiro acesso, guardada só na memória da aba para ativar o MFA na
 * tela seguinte sem pedir a mesma senha de novo. Lida uma única vez; nunca vai para storage.
 * Se a página recarregar, some, e a tela do MFA volta a pedir a senha.
 */
let pending: string | null = null;

export const handOffPassword = (password: string) => {
  pending = password;
};

export const takePassword = () => {
  const p = pending;
  pending = null;
  return p;
};
