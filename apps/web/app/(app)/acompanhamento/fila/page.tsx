import type { FilaDTO, FilaGrupo, MensagemModelo } from '@npac/shared/mentoria';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { Fila } from '@/components/acompanhamento/fila';
import { lerEu, podeExportar, sessaoDoModulo } from '@/lib/acompanhamento';
import { FILA_REGRAS, acCookie } from '@/lib/acompanhamento-prefs';
import { apiGet, apiPost } from '@/lib/api';

export const metadata = { title: 'Fila do dia' };

/**
 * Fila do dia (§5, D18). "Minha fila" ou "Equipe" pela URL; o item aberto também (`?item=`). Sem
 * `ver` na URL, vale o lembrado no aparelho (NPAC-46), como o grupo de itens.
 */
export default async function FilaPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>;
}) {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const [url, eu, jar] = await Promise.all([searchParams, lerEu(), cookies()]);
  const cookie = acCookie('fila', me.id);
  const salvo = readPrefs(jar.get(cookie)?.value, FILA_REGRAS);
  // Sem perfil não há o botão Minha/Equipe: o lembrado não vale.
  const ver = url.ver ?? (eu?.perfil ? salvo.ver : undefined);
  const escopo = ver === 'equipe' ? 'EQUIPE' : ver === 'minha' ? 'MINHA' : undefined;
  const [dados, mensagens] = await Promise.all([
    apiPost<FilaDTO>('/api/mentoria/fila', escopo ? { escopo } : {}),
    apiGet<MensagemModelo[]>('/api/mentoria/mensagens'),
  ]);
  return (
    <Fila
      dados={dados}
      mensagens={mensagens}
      euId={me.id}
      temPerfil={!!eu?.perfil}
      admin={!!eu?.admin}
      exportar={podeExportar(eu)}
      lembrar={{ cookie, valor: writePrefs(salvo, FILA_REGRAS) }}
      inicialGrupo={(salvo.grupo as FilaGrupo | undefined) ?? 'TODOS'}
    />
  );
}
