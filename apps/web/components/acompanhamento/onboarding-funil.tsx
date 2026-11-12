'use client';
import {
  ETAPA_LABEL,
  type Etapa,
  type PainelOnboarding,
  type PessoaFunil,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { readPrefs } from '@npac/shared/screen-prefs';
import { useEffect, useState } from 'react';
import { ONBOARDING_REGRAS, atualizarAc } from '@/lib/acompanhamento-prefs';
import { useLatestPrefs } from '@/lib/use-latest-prefs';
import { button, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { Dialogo } from './dialogo';
import { dataBR, Rostos } from './ui';

const sm = (classe: string) => `${classe} sm`;
const ficha = (id: string) => `/acompanhamento/ficha/${id}`;
const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

function SeloDias({ p }: { p: PessoaFunil }) {
  const enviada = p.status === 'ENVIADA';
  if (p.dias === 0) return <span className="tag">{enviada ? 'Enviada hoje' : 'Desde hoje'}</span>;
  return (
    <span className={`tag ${p.alerta ? 'canc' : ''}`}>
      Parado há {p.dias} {plural(p.dias, 'dia', 'dias')}
    </span>
  );
}

function Linha({
  p,
  primeira,
  andar,
  dispensar,
}: {
  p: PessoaFunil;
  primeira: boolean;
  andar: (p: PessoaFunil, status: 'ENVIADA' | 'CONCLUIDA') => void;
  dispensar: (p: PessoaFunil) => void;
}) {
  return (
    <li className={`ob-r ${primeira ? 'p1' : ''}`}>
      <Link className="ob-id" href={ficha(p.inscricaoId)}>
        <Rostos pessoas={p.pessoas} />
        <div className="nm">
          {p.nome}
          <small>
            {p.tipo === 'CASAL' ? 'Casal' : 'Individual'}, {p.mentoria}
          </small>
        </div>
      </Link>
      <SeloDias p={p} />
      <div className="ob-acoes">
        {p.etapa === 'CAIXA' ? (
          <Link className={sm(button)} href={`${ficha(p.inscricaoId)}?aba=jornada`}>
            {p.status === 'ENVIADA' ? 'Registrar recebimento' : 'Registrar envio'}
          </Link>
        ) : p.etapa === 'IDR' ? (
          <Link className={sm(quietButton)} href={`${ficha(p.inscricaoId)}?aba=jornada`}>
            Abrir a ficha
          </Link>
        ) : p.status === 'PENDENTE' ? (
          <button type="button" className={sm(button)} onClick={() => andar(p, 'ENVIADA')}>
            Marcar enviada
          </button>
        ) : (
          <button type="button" className={sm(button)} onClick={() => andar(p, 'CONCLUIDA')}>
            Marcar concluída
          </button>
        )}
        {p.mentoria !== 'RDV' && (
          <button type="button" className={sm(quietButton)} onClick={() => dispensar(p)}>
            Dispensar
          </button>
        )}
      </div>
    </li>
  );
}

type Painel = 'funil' | 'caixas' | 'idrs';

/** Aba Onboarding: funil das 6 etapas, quem está parado, caixas em trânsito e IDRs a agendar. */
export function OnboardingFunil({
  painel,
  lembrar,
}: {
  painel: PainelOnboarding;
  /** Cookie da etapa e do painel lembrados (NPAC-46) e o valor que o servidor usou. */
  lembrar: { cookie: string; valor: string };
}) {
  const router = useRouter();
  const salvo = readPrefs(lembrar.valor, ONBOARDING_REGRAS);
  const noFunil = (e: string | undefined) =>
    painel.funil.some((c) => c.etapa === e) ? (e as Etapa) : undefined;
  const maisParada = [...painel.funil].sort((a, b) => b.alertas - a.alertas)[0];
  const inicial =
    maisParada && maisParada.alertas > 0
      ? maisParada.etapa
      : (painel.funil.find((c) => c.total > 0)?.etapa ?? 'BOAS_VINDAS');
  const [escolhida, setEscolhida] = useState<Etapa>(noFunil(salvo.etapa) ?? inicial);
  const [aba, setAba] = useState<Painel>((salvo.painel as Painel | undefined) ?? 'funil');
  const lembrarEscolha = (etapa: Etapa, p: Painel) =>
    atualizarAc('onboarding', lembrar.cookie, ONBOARDING_REGRAS, {
      etapa,
      painel: p === 'funil' ? undefined : p,
    });
  // Voltar do navegador traz a página de antes: vale a escolha mais nova do cookie.
  useLatestPrefs(lembrar.cookie, lembrar.valor, (valor) => {
    const p = readPrefs(valor, ONBOARDING_REGRAS);
    const etapa = noFunil(p.etapa);
    if (etapa) setEscolhida(etapa);
    setAba((p.painel as Painel | undefined) ?? 'funil');
  });
  const [erro, setErro] = useState('');
  const [dispensando, setDispensando] = useState<PessoaFunil | null>(null);
  const coluna = painel.funil.find((c) => c.etapa === escolhida)!;
  const alertas = painel.funil.reduce((n, c) => n + c.alertas, 0);

  // O menu pré-carrega a aba com os dados daquele instante; aqui as linhas andam por `version`.
  useEffect(() => {
    router.refresh();
  }, [router]);

  async function andar(p: PessoaFunil, status: 'ENVIADA' | 'CONCLUIDA') {
    setErro('');
    try {
      await clientApi(`/api/mentoria/onboarding/${p.etapaId}`, 'PATCH', {
        version: p.version,
        status,
      });
    } catch (e) {
      setErro((e as Error).message);
    }
    router.refresh();
  }

  const abas: [Painel, string][] = [
    ['funil', 'Funil'],
    ['caixas', `Caixas em trânsito (${painel.caixasEmTransito.length})`],
    ['idrs', `IDRs a agendar (${painel.idrsAAgendar.length})`],
  ];

  return (
    <section className="view">
      <div>
        <h1 className="h1">Onboarding</h1>
        <p className="sub">
          {painel.total} em onboarding
          {alertas > 0 && `, ${alertas} ${plural(alertas, 'parado', 'parados')} além do prazo`}.
        </p>
      </div>

      <div className="fun" role="group" aria-label="Funil das etapas">
        {painel.funil.map((c, i) => (
          <button
            key={c.etapa}
            type="button"
            className={`fun-t ${c.etapa === escolhida ? 'on' : ''}`}
            aria-pressed={c.etapa === escolhida}
            onClick={() => {
              setEscolhida(c.etapa);
              setAba('funil');
              lembrarEscolha(c.etapa, 'funil');
            }}
          >
            <span className="lb">{ETAPA_LABEL[c.etapa]}</span>
            <b>{c.total}</b>
            <span className={`al ${c.alertas ? 'ruim' : ''}`}>
              {c.alertas
                ? `${c.alertas} ${plural(c.alertas, 'parado', 'parados')}`
                : `Etapa ${i + 1}`}
            </span>
          </button>
        ))}
      </div>

      <div className="tabs ob-tabs" role="tablist">
        {abas.map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            className={aba === id ? 'on' : ''}
            onClick={() => {
              setAba(id);
              lembrarEscolha(escolhida, id);
            }}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}

      <div className="ob-corpo">
        <section className={`card overflow-hidden ${aba === 'funil' ? '' : 'ob-oculto'}`}>
          <h2 className="ob-h">
            {ETAPA_LABEL[coluna.etapa]}
            <span>{coluna.total}</span>
          </h2>
          {coluna.pessoas.length > 0 ? (
            <ul>
              {coluna.pessoas.map((p, i) => (
                <Linha
                  key={p.etapaId}
                  p={p}
                  primeira={i === 0}
                  andar={(x, s) => void andar(x, s)}
                  dispensar={setDispensando}
                />
              ))}
            </ul>
          ) : (
            <div className="vazio">
              <h2>Ninguém nesta etapa</h2>
              <p>Escolha outra etapa no funil.</p>
            </div>
          )}
        </section>

        <div className="ob-lado">
          <section className={`card overflow-hidden ${aba === 'caixas' ? '' : 'ob-oculto'}`}>
            <h2 className="ob-h">
              Caixas em trânsito<span>{painel.caixasEmTransito.length}</span>
            </h2>
            {painel.caixasEmTransito.map((c, i) => (
              <Link
                key={c.inscricaoId}
                className={`ob-m ${i ? '' : 'p1'}`}
                href={ficha(c.inscricaoId)}
              >
                <Rostos pessoas={c.pessoas} />
                <div className="nm">
                  {c.nome}
                  <small>
                    Enviada em {dataBR(c.enviadoEm)}
                    {c.rastreio ? `, ${c.rastreio}` : ''}
                  </small>
                </div>
                <span className={`tag ${c.alerta ? 'canc' : ''}`}>
                  {c.dias} {plural(c.dias, 'dia', 'dias')}
                </span>
              </Link>
            ))}
            {painel.caixasEmTransito.length === 0 && (
              <p className="ob-vazio">Nenhuma caixa a caminho.</p>
            )}
          </section>

          <section className={`card overflow-hidden ${aba === 'idrs' ? '' : 'ob-oculto'}`}>
            <h2 className="ob-h">
              IDRs a agendar<span>{painel.idrsAAgendar.length}</span>
            </h2>
            {painel.idrsAAgendar.map((c, i) => (
              <Link
                key={c.inscricaoId}
                className={`ob-m ${i ? '' : 'p1'}`}
                href={ficha(c.inscricaoId)}
              >
                <Rostos pessoas={c.pessoas} />
                <div className="nm">
                  {c.nome}
                  <small>
                    {c.entregueEm
                      ? `Caixa entregue em ${dataBR(c.entregueEm)}`
                      : 'Caixa dispensada'}
                  </small>
                </div>
              </Link>
            ))}
            {painel.idrsAAgendar.length === 0 && (
              <p className="ob-vazio">Nenhuma IDR esperando agenda.</p>
            )}
          </section>
        </div>
      </div>

      {dispensando && (
        <Dialogo
          titulo={`Dispensar ${ETAPA_LABEL[dispensando.etapa]}?`}
          texto={`${dispensando.nome}: a etapa conta como feita e libera a próxima. Não pode ser desfeito.`}
          rotulo="Dispensar"
          onConfirmar={async () => {
            await clientApi(`/api/mentoria/onboarding/${dispensando.etapaId}/dispensar`, 'POST', {
              version: dispensando.version,
            });
            router.refresh();
          }}
          onFechar={() => setDispensando(null)}
        />
      )}
    </section>
  );
}
