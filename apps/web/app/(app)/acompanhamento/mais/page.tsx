import { PERFIL_LABEL } from '@npac/shared/mentoria';
import Link from 'next/link';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { ICONES, Icone } from '@/components/acompanhamento/ui';
import { lerEu, podeCadastrar, sessaoDoModulo, ultimaFicha } from '@/lib/acompanhamento';

export const metadata = { title: 'Mais' };

type Item = {
  rotulo: string;
  icone: string;
  href?: string;
  sub?: string;
  breve?: boolean;
};

const breve = (rotulo: string, icone: string, aba: string): Item => ({
  rotulo,
  icone,
  href: `/acompanhamento/em-breve/${aba}`,
  breve: true,
});

function Linha({ item, primeira }: { item: Item; primeira: boolean }) {
  const classe = `ml ${item.breve ? 'off' : ''} ${primeira ? 'p1' : ''}`;
  const miolo = (
    <>
      <span className="i">
        <Icone d={item.icone} />
      </span>
      <div className="t">
        <b>{item.rotulo}</b>
        {item.sub && <span>{item.sub}</span>}
      </div>
      {item.breve ? (
        <span className="tag">Em breve</span>
      ) : (
        <Icone d={ICONES.seta} className="seta" />
      )}
    </>
  );
  return item.href ? (
    <Link className={classe} href={item.href}>
      {miolo}
    </Link>
  ) : (
    <div className={classe}>{miolo}</div>
  );
}

function Grupo({ titulo, itens }: { titulo: string; itens: Item[] }) {
  return (
    <div className="ml-g">
      <h2>{titulo}</h2>
      <div className="card">
        {itens.map((x, i) => (
          <Linha key={x.rotulo} item={x} primeira={i === 0} />
        ))}
      </div>
    </div>
  );
}

/** Mais (celular): o resto do menu do módulo e a conta. */
export default async function MaisPage() {
  const me = await sessaoDoModulo();
  if (!me) return null;
  const [eu, ultima] = await Promise.all([lerEu(), ultimaFicha()]);
  const perfil = eu?.perfil ? PERFIL_LABEL[eu.perfil] : 'Diretoria';
  const cargo = eu?.admin && eu.perfil ? `${perfil} e Admin` : perfil;
  const avisos: Item = {
    rotulo: 'Avisos neste aparelho',
    icone: ICONES.sino,
    href: '/conta/avisos',
    sub: 'Push da Fila do dia',
  };
  return (
    <section className="view">
      <h1 className="h1">Mais</h1>
      <Link className="card ml-conta" href="/conta/senha">
        <span className="ava me">{me.name.slice(0, 1)}</span>
        <div>
          <b>{me.name}</b>
          <span className="d">{cargo}</span>
        </div>
        <Icone d={ICONES.seta} className="seta" />
      </Link>
      <Grupo
        titulo="Acompanhamento"
        itens={[
          {
            rotulo: 'Ficha do mentorado',
            icone: ICONES.ficha,
            href: '/acompanhamento/ficha',
            sub: ultima ? `Última aberta: ${ultima.nome}` : undefined,
          },
          ...(podeCadastrar(eu)
            ? [
                {
                  rotulo: 'Onboarding',
                  icone: ICONES.onboarding,
                  href: '/acompanhamento/onboarding',
                },
              ]
            : []),
          {
            rotulo: 'Plano dos 12 meses',
            icone: ICONES.plano,
            href: '/acompanhamento/plano',
          },
        ]}
      />
      <Grupo
        titulo="Em breve"
        itens={[
          breve('PMEs e ciclos', ICONES.pmes, 'pmes'),
          breve('Linha do tempo e conquistas', ICONES.linha, 'linha-do-tempo'),
          breve('Envios físicos', ICONES.envios, 'envios'),
          breve('Eventos e agenda', ICONES.eventos, 'eventos'),
          breve('Renovações e gestão', ICONES.renovacoes, 'renovacoes'),
        ]}
      />
      {eu?.admin && (
        <Grupo
          titulo="Admin"
          itens={[
            {
              rotulo: 'Configurações',
              icone: ICONES.config,
              href: '/acompanhamento/configuracoes',
              sub: 'Perfis, plano, mensagens, importação',
            },
          ]}
        />
      )}
      <div className="ml-g">
        <h2>Conta</h2>
        <div className="card">
          <Linha item={avisos} primeira />
          <div className="ml sair">
            <span className="i">
              <Icone d={ICONES.sair} />
            </span>
            <div className="t">
              <b>Sair</b>
            </div>
            <SignOutButton className="" />
          </div>
        </div>
      </div>
    </section>
  );
}
