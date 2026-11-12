import {
  MENTORIAS,
  type MensagemModelo,
  type Mentoria,
  type PerfilLinha,
  type PlanoModeloLinha,
  type Responsavel,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LembrarUrl } from '@/components/acompanhamento/lembrar-url';
import { ImportarCarteira } from '@/components/acompanhamento/importar-carteira';
import { MensagensAdmin } from '@/components/acompanhamento/mensagens-admin';
import { PerfisAdmin } from '@/components/acompanhamento/perfis-admin';
import { PlanoModeloAdmin } from '@/components/acompanhamento/plano-modelo-admin';
import { TransferirCarteira } from '@/components/acompanhamento/transferir-carteira';
import { ICONES, Icone } from '@/components/acompanhamento/ui';
import { lerEu, sessaoDoModulo } from '@/lib/acompanhamento';
import { abasLembradas } from '@/lib/acompanhamento-abas';
import { apiGet } from '@/lib/api';

export const metadata = { title: 'Configurações' };

const SUB = {
  perfis: 'Quem usa o Acompanhamento e o que cada pessoa pode fazer.',
  plano: 'A ação de cada mês, por mentoria.',
  importacao: 'Traga a carteira atual do gerenciador e da planilha, sem redigitar.',
  mensagens: 'O texto que os botões de WhatsApp copiam, por momento.',
  carteira: 'Passe as inscrições de uma pessoa para outra do Acompanhamento.',
};
const ABAS = ['perfis', 'plano', 'mensagens', 'importacao', 'carteira'] as const;
type AbaConfig = (typeof ABAS)[number];
/** Aba e mentoria do plano-modelo lembradas (NPAC-46). */
const CHAVES = { perfis: [], plano: ['mentoria'], mensagens: [], importacao: [], carteira: [] };
const ROTULOS: Record<AbaConfig, string> = {
  perfis: 'Perfis',
  plano: 'Plano-modelo',
  mensagens: 'Mensagens-modelo',
  importacao: 'Importação',
  carteira: 'Transferir carteira',
};

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; mentoria?: string }>;
}) {
  const me = await sessaoDoModulo();
  if (!me) return null;
  if (!(await lerEu())?.admin) notFound();
  const lembradas = await abasLembradas('configuracoes', me.id, await searchParams, {
    abas: ABAS,
    padrao: 'perfis',
    chaves: CHAVES,
  });
  const { aba, q } = lembradas;
  const mentoria = MENTORIAS.includes(q.mentoria as Mentoria) ? (q.mentoria as Mentoria) : 'RDV';
  const perfis = aba === 'perfis' ? await apiGet<PerfilLinha[]>('/api/mentoria/perfis') : [];
  const responsaveis =
    aba === 'carteira' ? await apiGet<Responsavel[]>('/api/mentoria/responsaveis') : [];
  const modelo =
    aba === 'plano' ? await apiGet<PlanoModeloLinha[]>('/api/mentoria/plano-modelo') : [];
  const mensagens =
    aba === 'mensagens' ? await apiGet<MensagemModelo[]>('/api/mentoria/mensagens') : [];
  return (
    <section className="view">
      <Link className="back so-cel" href="/acompanhamento/mais">
        <Icone d={ICONES.voltar} />
        Mais
      </Link>
      <div>
        <h1 className="h1">Configurações</h1>
        <p className="sub">{SUB[aba]}</p>
      </div>
      <div className="tabs">
        {ABAS.map((id) => (
          <Link key={id} className={aba === id ? 'on' : ''} href={lembradas.href(id)}>
            {ROTULOS[id]}
          </Link>
        ))}
      </div>
      {aba === 'importacao' && <ImportarCarteira />}
      {aba === 'mensagens' && <MensagensAdmin mensagens={mensagens} />}
      {aba === 'carteira' && <TransferirCarteira responsaveis={responsaveis} />}
      {aba === 'plano' && <PlanoModeloAdmin linhas={modelo} mentoria={mentoria} />}
      <LembrarUrl
        screen="configuracoes"
        cookie={lembradas.cookie}
        valor={lembradas.valor}
        abas={ABAS}
        aba={aba}
        consulta={lembradas.consulta}
        doMenu={lembradas.doMenu}
      />
      {aba === 'perfis' && (
        <>
          <PerfisAdmin inicial={perfis} />
          <p className="pf-nota">
            A Diretoria é Admin automaticamente. Conta nova: a Diretoria cria o login no Admin do
            CRM, já com o perfil. Aqui você troca o perfil de quem já está na equipe.
          </p>
        </>
      )}
    </section>
  );
}
