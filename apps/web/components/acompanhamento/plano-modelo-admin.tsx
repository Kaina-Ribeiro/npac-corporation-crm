'use client';
import {
  GATILHO_LABEL,
  GATILHOS,
  MENTORIAS,
  PERFIL_LABEL,
  PERFIS_ACAO,
  REUNIAO_TIPO_LABEL,
  REUNIAO_TIPOS,
  type Mentoria,
  type PlanoModeloLinha,
} from '@npac/shared/mentoria';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { button, control, FormError, quietButton } from '@/components/crm-ui';
import { clientApi } from '@/lib/client-api';
import { filaDeSalvamento, registrarVersion, salvarCampo } from '@/lib/acompanhamento-saver';
import { CampoPr, INTEIRO } from './campo';
import { CampoSimNao } from './etapa-card';
import { IndicadorSalvo } from './indicador-salvo';
import { ICONES, Icone } from './ui';

const raiz = '/acompanhamento/configuracoes';
const AVISO = 'As mudanças valem para as próximas jornadas. O que já foi criado não muda.';

/** Configurações > Plano-modelo: as linhas de cada mentoria. */
export function PlanoModeloAdmin({
  linhas,
  mentoria,
}: {
  linhas: PlanoModeloLinha[];
  mentoria: Mentoria;
}) {
  const daMentoria = linhas.filter((l) => l.mentoria === mentoria);
  return (
    <>
      <div className="pl-topo">
        <div className="seg" role="group" aria-label="Mentoria">
          {MENTORIAS.map((m) => (
            <Link
              key={m}
              className={m === mentoria ? 'on' : ''}
              aria-current={m === mentoria ? 'true' : undefined}
              href={`${raiz}?aba=plano&mentoria=${m}`}
            >
              {m}
            </Link>
          ))}
        </div>
        <Link className={`${button} sm`} href={`${raiz}/plano/nova?mentoria=${mentoria}`}>
          Nova linha
        </Link>
      </div>
      <section className="card overflow-hidden">
        <ul className="pl-lista">
          {daMentoria.map((l) => (
            <li key={l.id}>
              <Link className={`pl-mod ${l.ativo ? '' : 'off'}`} href={`${raiz}/plano/${l.id}`}>
                <b className="pl-n">{l.mes}</b>
                <div className="min-w-0">
                  <span className="t">{l.foco}</span>
                  <span className="d">{l.acao}</span>
                </div>
                <span className="r">{PERFIL_LABEL[l.responsavelPerfil]}</span>
                {!l.ativo && <span className="tag">Inativa</span>}
                <Icone d={ICONES.seta} className="seta" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <p className="pf-nota">{AVISO}</p>
    </>
  );
}

const opcoesPerfil = PERFIS_ACAO.map((p) => ({ valor: p, rotulo: PERFIL_LABEL[p] }));
const opcoesGatilho = GATILHOS.map((g) => ({ valor: g, rotulo: GATILHO_LABEL[g] }));
const opcoesReuniao = REUNIAO_TIPOS.map((r) => ({ valor: r, rotulo: REUNIAO_TIPO_LABEL[r] }));

const paraLinhas = (t: string) =>
  t
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

/** Uma linha do plano, aberta em página própria. Salva ao sair de cada campo. */
export function PlanoModeloLinhaForm({ linha }: { linha: PlanoModeloLinha }) {
  const router = useRouter();
  const chave = `modelo:${linha.id}`;
  const [itens, setItens] = useState(linha.itens.join('\n'));
  const atualizar = () =>
    void filaDeSalvamento()
      .idle()
      .then(() => router.refresh());
  useEffect(() => {
    registrarVersion(chave, linha.version);
  }, [chave, linha.version]);
  const base = { chave };
  return (
    <section className="view pl-acao">
      <Link className="back" href={`${raiz}?aba=plano&mentoria=${linha.mentoria}`}>
        <Icone d={ICONES.voltar} />
        Plano-modelo do {linha.mentoria}
      </Link>
      <div>
        <h1 className="h1">{linha.foco}</h1>
        <p className="sub">{AVISO}</p>
        <div className="fh-tags">
          <span className="tag gold">{linha.mentoria}</span>
          <IndicadorSalvo />
        </div>
      </div>
      <section className="card pa">
        <CampoPr
          {...base}
          rotulo="Mês"
          campo="mes"
          valor={linha.mes}
          inputMode="numeric"
          conversao={INTEIRO}
          aoSalvar={atualizar}
        />
        <CampoPr {...base} rotulo="Foco" campo="foco" valor={linha.foco} aoSalvar={atualizar} />
        <CampoPr {...base} rotulo="Ação" campo="acao" valor={linha.acao} classe="longo" />
        <CampoPr
          {...base}
          rotulo="Responsável"
          campo="responsavelPerfil"
          valor={linha.responsavelPerfil}
          tipo="select"
          semVazio
          opcoes={opcoesPerfil}
        />
        <CampoPr
          {...base}
          rotulo="Gatilho"
          campo="gatilho"
          valor={linha.gatilho}
          tipo="select"
          semVazio
          opcoes={opcoesGatilho}
        />
        <CampoPr
          {...base}
          rotulo="Dias para executar"
          campo="diasParaExecutar"
          valor={linha.diasParaExecutar}
          inputMode="numeric"
          conversao={INTEIRO}
        />
        <CampoPr
          {...base}
          rotulo="Reunião"
          campo="reuniaoTipo"
          valor={linha.reuniaoTipo}
          tipo="select"
          opcoes={opcoesReuniao}
        />
        <CampoSimNao
          {...base}
          editavel
          rotulo="Segue o calendário"
          campo="segueCalendario"
          valor={linha.segueCalendario}
        />
        <CampoSimNao
          {...base}
          editavel
          rotulo="Ativa"
          campo="ativo"
          valor={linha.ativo}
          aoSalvar={atualizar}
        />
        <div className="tx pl-tx">
          <label>
            <small>Passos, um por linha</small>
            <textarea
              value={itens}
              onChange={(e) => setItens(e.target.value)}
              onBlur={() => {
                const novo = paraLinhas(itens);
                if (JSON.stringify(novo) !== JSON.stringify(linha.itens))
                  salvarCampo(chave, 'itens', novo, JSON.stringify(linha.itens));
              }}
            />
          </label>
        </div>
      </section>
    </section>
  );
}

/** Nova linha do plano: formulário com salvar, porque só nasce com os campos obrigatórios. */
export function PlanoModeloNova({ mentoria }: { mentoria: Mentoria }) {
  const router = useRouter();
  const [mes, setMes] = useState('1');
  const [foco, setFoco] = useState('');
  const [acao, setAcao] = useState('');
  const [responsavelPerfil, setResponsavel] = useState<string>('ACOMPANHAMENTO');
  const [erro, setErro] = useState('');
  const voltar = `${raiz}?aba=plano&mentoria=${mentoria}`;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    try {
      await clientApi('/api/mentoria/plano-modelo', 'PUT', {
        mentoria,
        mes: Number(mes),
        foco: foco.trim(),
        acao: acao.trim(),
        responsavelPerfil,
      });
      router.push(voltar);
      router.refresh();
    } catch (x) {
      setErro((x as Error).message);
    }
  }

  return (
    <section className="view pl-acao">
      <Link className="back" href={voltar}>
        <Icone d={ICONES.voltar} />
        Plano-modelo do {mentoria}
      </Link>
      <div>
        <h1 className="h1">Nova linha do {mentoria}</h1>
        <p className="sub">{AVISO}</p>
      </div>
      <form className="card pa pl-nova" onSubmit={(e) => void salvar(e)}>
        <label className="f">
          <span>Mês</span>
          <input
            className={control}
            inputMode="numeric"
            value={mes}
            required
            onChange={(e) => setMes(e.target.value)}
          />
        </label>
        <label className="f">
          <span>Foco</span>
          <input
            className={control}
            maxLength={120}
            value={foco}
            required
            onChange={(e) => setFoco(e.target.value)}
          />
        </label>
        <label className="f">
          <span>Ação</span>
          <input
            className={control}
            maxLength={500}
            value={acao}
            required
            onChange={(e) => setAcao(e.target.value)}
          />
        </label>
        <label className="f">
          <span>Responsável</span>
          <select
            className={control}
            value={responsavelPerfil}
            onChange={(e) => setResponsavel(e.target.value)}
          >
            {opcoesPerfil.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <FormError message={erro} />
        <div className="ob-acoes">
          <button type="submit" className={button}>
            Criar linha
          </button>
          <Link className={quietButton} href={voltar}>
            Cancelar
          </Link>
        </div>
      </form>
    </section>
  );
}
