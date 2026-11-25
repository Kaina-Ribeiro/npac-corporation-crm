'use client';

// O componente mora em `shell/live-updates.tsx`, que já vai no JS de toda tela: assim o limite de
// erro não baixa um pacote próprio em cada carga (teto de JS do /leads).
export { ErroDaTela as default } from '@/components/shell/live-updates';
