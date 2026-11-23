import type { FilaDTO, FilaGrupo, MensagemModelo, Responsavel } from '@npac/shared/mentoria';
import { readPrefs, writePrefs } from '@npac/shared/screen-prefs';
import { cookies } from 'next/headers';
import { Fila } from '@/components/acompanhamento/fila';
import { lerEu, podeExportar, sessaoDoModulo } from '@/lib/acompanhamento';
import { FILA_REGRAS, acCookie } from '@/lib/acompanhamento-prefs';
import { apiGet, apiPost } from '@/lib/api';
import { PushInvite } from '@/components/push-invite';
import { getTeamPhotos } from '@/lib/team-photos';

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
  // Sem perfil, ou com "só a carteira" (a API dá sempre a Minha fila), não há o botão Minha/Equipe:
  // o lembrado não vale.
  const comBotao = !!eu?.perfil && !eu.soCarteira;
  const ver = comBotao ? (url.ver ?? salvo.ver) : undefined;
  const escopo = ver === 'equipe' ? 'EQUIPE' : ver === 'minha' ? 'MINHA' : undefined;
  const [dados, mensagens] = await Promise.all([
    apiPost<FilaDTO>('/api/mentoria/fila', escopo ? { escopo } : {}),
    apiGet<MensagemModelo[]>('/api/mentoria/mensagens'),
  ]);
  // "Nova inscrição" (NPAC-56): a Admin escolhe a responsável ali mesmo, entre as elegíveis.
  const responsaveis = dados.itens.some((i) => i.tipo === 'NOVA_INSCRICAO')
    ? (await apiGet<Responsavel[]>('/api/mentoria/responsaveis')).filter((r) => r.elegivel)
    : [];
  return (
    <>
      <PushInvite className="mb-5" />
      <Fila
        photos={await getTeamPhotos()}
        dados={dados}
        mensagens={mensagens}
        responsaveis={responsaveis}
        euId={me.id}
        temPerfil={comBotao}
        admin={!!eu?.admin}
        exportar={podeExportar(eu)}
        lembrar={{ cookie, valor: writePrefs(salvo, FILA_REGRAS) }}
        inicialGrupo={(salvo.grupo as FilaGrupo | undefined) ?? 'TODOS'}
      />
    </>
  );
}
