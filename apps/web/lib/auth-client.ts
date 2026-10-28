'use client';
import { twoFactorClient, usernameClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

// Mesma origem: /api/auth é repassado para a API pelo rewrite do Next.
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [usernameClient(), twoFactorClient()],
});
