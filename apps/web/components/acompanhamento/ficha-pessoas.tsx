'use client';
import { normalizePhoneBR, type FichaDTO, type PessoaDTO } from '@npac/shared/mentoria';
import { money } from '@npac/shared/money';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { quietButton } from '@/components/crm-ui';
import { avisar, filaDeSalvamento } from '@/lib/acompanhamento-saver';
import { clientApi } from '@/lib/client-api';
import { CampoPr, DINHEIRO, useCampo, type Conversao } from './campo';
import { Dialogo } from './dialogo';
import { enviarFoto } from './midia';
import { dataBR, ICONES, Icone, Rostos } from './ui';

const sm = `${quietButton} sm`;
const PULSEIRAS = ['P', 'M', 'G', 'GG'].map((v) => ({ valor: v, rotulo: v }));

/** `+5519900000101` → `+55 19 90000-0101`; grava já no formato do servidor. */
const TELEFONE: Conversao = {
  paraTexto: (v) => {
    if (!v) return '';
    const m = /^\+55(\d{2})(\d{4,5})(\d{4})$/.exec(String(v));
    return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : String(v);
  },
  deTexto: (t) => (t.trim() ? (normalizePhoneBR(t) ?? t.trim()) : null),
};
const EMAIL: Conversao = { deTexto: (t) => t.trim().toLowerCase() || null };
const CEP: Conversao = {
  paraTexto: (v) => (v ? String(v).replace(/^(\d{5})(\d{3})$/, '$1-$2') : ''),
  deTexto: (t) => t.replace(/\D/g, '') || null,
};
const NOME: Conversao = { deTexto: (t) => t.trim() };

/** O que veio ilegível da importação, com o nome da pergunta do diagnóstico. */
const COMPLETAR_LABEL: Record<string, string> = {
  recebeCentavos: 'Renda atual',
  guardadoCentavos: 'Dinheiro guardado',
  dividasCentavos: 'Dívidas',
  pessoa_2: 'Segunda pessoa',
  inicioJornada: 'Início da jornada (na Inscrição)',
};

const primeiroNome = (p: PessoaDTO) => p.nome.split(' ')[0] ?? p.nome;

/** Uma pergunta numerada do diagnóstico: rótulo e resposta, salva ao sair do campo. */
function Resposta({
  n,
  rotulo,
  chave,
  campo,
  valor,
  editavel,
  longo = false,
  dinheiro = false,
  conversao,
  placeholder,
  aoSalvar,
}: {
  n: number;
  rotulo: string;
  chave: string;
  campo: string;
  valor: unknown;
  editavel: boolean;
  longo?: boolean;
  dinheiro?: boolean;
  conversao?: Conversao;
  placeholder?: string;
  aoSalvar?: () => void;
}) {
  const id = useId();
  const c = useCampo(chave, campo, valor, dinheiro ? DINHEIRO : conversao);
  const comum = {
    id,
    value: c.texto,
    readOnly: !editavel,
    placeholder: editavel ? (placeholder ?? (dinheiro ? 'R$ 0,00' : undefined)) : '—',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      c.setTexto(e.target.value),
    onFocus: c.aoFocar,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (editavel && c.aoSair(e.target.value)) aoSalvar?.();
    },
  };
  return (
    <div className={`dg-l${longo ? ' dg-longo' : ''}`}>
      <span className="dg-n" aria-hidden="true">
        {n}
      </span>
      <label className="dg-r" htmlFor={id}>
        {rotulo}
      </label>
      {longo ? (
        <textarea className="dg-v dg-tx" rows={2} {...comum} />
      ) : (
        <input className="pv dg-v" inputMode={dinheiro ? 'decimal' : undefined} {...comum} />
      )}
    </div>
  );
}

/** Dívida: o que é e quanto deve; o valor entra no total que a Evolução usa (gatilho da 0086). */
function Divida({
  n,
  i,
  ficha,
  editavel,
  atualizar,
}: {
  n: number;
  i: 1 | 2 | 3;
  ficha: FichaDTO;
  editavel: boolean;
  atualizar: () => void;
}) {
  const chave = `momento:${ficha.id}`;
  const m = ficha.momento;
  const idTexto = useId();
  const texto = useCampo(chave, `divida${i}`, m?.[`divida${i}`]);
  const valor = useCampo(chave, `divida${i}Centavos`, m?.[`divida${i}Centavos`], DINHEIRO);
  const rotulo = `Dívida ${i}`;
  return (
    <div className="dg-l">
      <span className="dg-n" aria-hidden="true">
        {n}
      </span>
      <label className="dg-r" htmlFor={idTexto}>
        {rotulo}
      </label>
      <div className="dg-par">
        <input
          id={idTexto}
          className="pv dg-v"
          value={texto.texto}
          readOnly={!editavel}
          placeholder={editavel ? 'O que é (cartão, empréstimo…)' : '—'}
          onChange={(e) => texto.setTexto(e.target.value)}
          onFocus={texto.aoFocar}
          onBlur={(e) => {
            if (editavel) texto.aoSair(e.target.value);
          }}
        />
        <input
          className="pv dg-v dg-valor"
          aria-label={`${rotulo}: valor`}
          inputMode="decimal"
          value={valor.texto}
          readOnly={!editavel}
          placeholder={editavel ? 'R$ 0,00' : '—'}
          onChange={(e) => valor.setTexto(e.target.value)}
          onFocus={valor.aoFocar}
          onBlur={(e) => {
            if (editavel && valor.aoSair(e.target.value)) atualizar();
          }}
        />
      </div>
    </div>
  );
}

/** Rostos e nomes; tocar no rosto troca a foto daquela pessoa. */
function Cabecalho({ ficha }: { ficha: FichaDTO }) {
  const router = useRouter();
  const base = useId();
  const ed = ficha.pode.inscricao;
  return (
    <div className="pc-h">
      <span className="dg-rostos">
        {ficha.pessoas.map((p, i) => (
          <span key={p.id} className={i ? 'dg-rosto-b' : undefined}>
            <label htmlFor={`${base}-${p.id}`} className={ed ? 'cursor-pointer' : ''}>
              <Rostos pessoas={[p]} />
            </label>
            {ed && (
              <input
                id={`${base}-${p.id}`}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label={`Foto de ${p.nome}`}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f)
                    void enviarFoto('pessoa-foto', p.id, f)
                      .then(() => router.refresh())
                      .catch((err: Error) => avisar(err.message));
                }}
              />
            )}
          </span>
        ))}
      </span>
      <div className="min-w-0">
        <b>{ficha.nome}</b>
        {ed && <span>Toque na foto para trocar</span>}
      </div>
    </div>
  );
}

/** As 20 perguntas da planilha "Diagnóstico" da Duda (NPAC-76), na ordem dela. */
function Diagnostico({ ficha, atualizar }: { ficha: FichaDTO; atualizar: () => void }) {
  const router = useRouter();
  const [pedido, setPedido] = useState<'concluir' | 'destravar' | null>(null);
  const m = ficha.momento;
  const travado = !!m?.travadoEm;
  const ed = ficha.pode.momento && !travado;
  const chave = `momento:${ficha.id}`;
  const url = `/api/mentoria/inscricoes/${ficha.id}/momento`;
  const [p1, p2] = ficha.pessoas;
  const pessoa = (p: PessoaDTO) => ({
    chave: `pessoa:${ficha.id}:${p.id}`,
    editavel: ficha.pode.inscricao,
  });
  const r = (campo: keyof NonNullable<FichaDTO['momento']>) => ({
    chave,
    campo,
    valor: m?.[campo],
    editavel: ed,
  });
  const total = m?.dividasCentavos;

  return (
    <>
      {ficha.completarCampos.length > 0 && (
        <p className="jg-aviso mo-completar">
          Veio da importação sem dado legível:{' '}
          {ficha.completarCampos.map((c) => COMPLETAR_LABEL[c] ?? c).join(', ')}. Falta completar.
        </p>
      )}
      <div className="mo-h dg-h">
        <div className="dg-tit">
          <h3>Diagnóstico</h3>
          {travado ? (
            <span className="locked">
              <Icone d={ICONES.cadeado} largura={2} />
              Concluído em {dataBR(m.travadoEm)}
              {m.travadoPor ? ` por ${m.travadoPor}` : ''}
            </span>
          ) : (
            <span className="text-xs font-semibold text-ink2">
              {ed ? 'Em preenchimento' : 'Ainda não concluído'}
            </span>
          )}
        </div>
        {travado && ficha.pode.admin && (
          <button type="button" className={sm} onClick={() => setPedido('destravar')}>
            Destravar
          </button>
        )}
        {ed && (
          <button type="button" className={sm} onClick={() => setPedido('concluir')}>
            Concluir
          </button>
        )}
      </div>

      <div className="dg">
        {p1 && (
          <Resposta
            n={1}
            rotulo="Nome"
            {...pessoa(p1)}
            campo="nome"
            valor={p1.nome}
            conversao={NOME}
            aoSalvar={atualizar}
          />
        )}
        {p1 && <Resposta n={2} rotulo="Cidade" {...pessoa(p1)} campo="cidade" valor={p1.cidade} />}
        <Resposta n={3} rotulo="Idade" {...r('idade')} />
        {p2 ? (
          <Resposta
            n={4}
            rotulo="Nome do parceiro(a)"
            {...pessoa(p2)}
            campo="nome"
            valor={p2.nome}
            conversao={NOME}
            aoSalvar={atualizar}
          />
        ) : (
          <Resposta n={4} rotulo="Nome do parceiro(a)" {...r('parceiroNome')} />
        )}
        <Resposta n={5} rotulo="Filho 1" {...r('filho1')} placeholder="Nome e idade" />
        <Resposta n={6} rotulo="Filho 2" {...r('filho2')} placeholder="Nome e idade" />
        <Resposta n={7} rotulo="Trabalho" {...r('trabalho')} placeholder="O que faz hoje" />
        <Resposta n={8} rotulo="Renda atual" {...r('recebeCentavos')} dinheiro />
        <Resposta n={9} rotulo="Dinheiro guardado" {...r('guardadoCentavos')} dinheiro />
        <Resposta n={10} rotulo="Bem 1" {...r('bem1')} placeholder="O que é e quanto vale" />
        <Resposta n={11} rotulo="Bem 2" {...r('bem2')} placeholder="O que é e quanto vale" />
        <Resposta
          n={12}
          rotulo="Investimento 1"
          {...r('investimento1')}
          placeholder="O que é e quanto tem"
        />
        <Resposta
          n={13}
          rotulo="Investimento 2"
          {...r('investimento2')}
          placeholder="O que é e quanto tem"
        />
        <Resposta n={14} rotulo="Custo médio mensal" {...r('custoCentavos')} dinheiro />
        {([1, 2, 3] as const).map((i) => (
          <Divida key={i} n={14 + i} i={i} ficha={ficha} editavel={ed} atualizar={atualizar} />
        ))}
        {total != null && (
          <p className="dg-total">
            Total das dívidas: <b>{money(total)}</b>
          </p>
        )}
        <Resposta n={18} rotulo="Sonhos e objetivos" {...r('sonho')} longo />
        <Resposta n={19} rotulo="Já buscou ajuda?" {...r('buscouAjuda')} longo />
        <Resposta n={20} rotulo="Anotações e percepções" {...r('anotacoes')} longo />
      </div>

      {pedido === 'concluir' && (
        <Dialogo
          titulo="Concluir o diagnóstico"
          texto="Depois de concluído, as respostas do diagnóstico ficam travadas. Nome, cidade, contato e entrega continuam editáveis. Só um Admin destrava."
          rotulo="Concluir"
          onConfirmar={async () => {
            await filaDeSalvamento().idle();
            await clientApi(`${url}/concluir`, 'POST');
            atualizar();
          }}
          onFechar={() => setPedido(null)}
        />
      )}
      {pedido === 'destravar' && (
        <Dialogo
          titulo="Destravar o diagnóstico"
          texto="As respostas do diagnóstico voltam a aceitar edição. A ação fica no histórico."
          rotulo="Destravar"
          onConfirmar={async () => {
            await clientApi(`${url}/destravar`, 'POST');
            router.refresh();
          }}
          onFechar={() => setPedido(null)}
        />
      )}
    </>
  );
}

/** WhatsApp, e-mail e pulseira de cada pessoa; endereço, CEP e foto da família da inscrição. */
function ContatoEntrega({ ficha, atualizar }: { ficha: FichaDTO; atualizar: () => void }) {
  const router = useRouter();
  const idFoto = useId();
  const ed = ficha.pode.inscricao;
  const casal = ficha.pessoas.length > 1;
  const chaveEnd = `endereco:${ficha.id}`;
  return (
    <>
      <h3>Contato e entrega</h3>
      <div className="props">
        {ficha.pessoas.map((p) => {
          const base = { chave: `pessoa:${ficha.id}:${p.id}`, editavel: ed };
          const de = casal ? ` (${primeiroNome(p)})` : '';
          return (
            <div key={p.id} className="contents">
              <CampoPr
                {...base}
                rotulo={`WhatsApp${de}`}
                campo="whatsapp"
                valor={p.whatsapp}
                inputMode="tel"
                conversao={TELEFONE}
                aoSalvar={atualizar}
              />
              <CampoPr
                {...base}
                rotulo={`E-mail${de}`}
                campo="email"
                valor={p.email}
                tipo="email"
                conversao={EMAIL}
              />
              <CampoPr
                {...base}
                rotulo={`Pulseira${de}`}
                campo="pulseira"
                valor={p.pulseira}
                tipo="select"
                opcoes={PULSEIRAS}
              />
            </div>
          );
        })}
        <CampoPr
          chave={chaveEnd}
          editavel={ed}
          rotulo="Endereço"
          campo="endereco"
          valor={ficha.endereco?.endereco}
          classe="longo"
        />
        <CampoPr
          chave={chaveEnd}
          editavel={ed}
          rotulo="CEP"
          campo="cep"
          valor={ficha.endereco?.cep}
          inputMode="numeric"
          conversao={CEP}
        />
        <div className="pr">
          <span>Foto da família</span>
          <div className="flex items-center gap-2">
            {ficha.fotoFamiliaMidiaId && (
              <a
                className="text-[13px] font-medium underline-offset-2 hover:underline"
                href={`/api/mentoria/midia/${ficha.fotoFamiliaMidiaId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver foto
              </a>
            )}
            {ed && (
              <label htmlFor={idFoto} className={`${sm} cursor-pointer`}>
                {ficha.fotoFamiliaMidiaId ? 'Trocar' : 'Anexar'}
              </label>
            )}
            {ed && (
              <input
                id={idFoto}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Foto da família"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f)
                    void enviarFoto('foto-familia', ficha.id, f)
                      .then(() => router.refresh())
                      .catch((err: Error) => avisar(err.message));
                }}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Aba Pessoa(s) (NPAC-76): uma só, também no casal. Diagnóstico da planilha da Duda (substitui a aba
 * Momento inicial) e, embaixo, contato e entrega, que os Envios e a Fila usam. Os campos antigos que
 * saíram da tela (apelido, nascimento, dor, meta, notas…) continuam guardados no banco.
 */
export function FichaPessoas({ ficha, atualizar }: { ficha: FichaDTO; atualizar: () => void }) {
  return (
    <section
      className="card pa"
      role="tabpanel"
      aria-label={ficha.pessoas.length > 1 ? 'Pessoas' : 'Pessoa'}
    >
      <Cabecalho ficha={ficha} />
      <Diagnostico ficha={ficha} atualizar={atualizar} />
      <ContatoEntrega ficha={ficha} atualizar={atualizar} />
    </section>
  );
}
