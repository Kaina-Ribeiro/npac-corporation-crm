'use client';
import {
  normalizePhoneBR,
  OCUPACAO_LABEL,
  OCUPACOES,
  TECNOLOGIA_LABEL,
  TECNOLOGIAS,
  type FichaDTO,
  type PessoaDTO,
} from '@npac/shared/mentoria';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { quietButton } from '@/components/crm-ui';
import { avisar } from '@/lib/acompanhamento-saver';
import { CampoPr, INTEIRO, type Conversao } from './campo';
import { enviarFoto } from './midia';
import { Rostos } from './ui';

const UFS =
  'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
const opcoesDe = (lista: readonly string[]) => lista.map((v) => ({ valor: v, rotulo: v }));
const CANAIS = ['WhatsApp', 'Ligação', 'E-mail'];
const PULSEIRAS = ['P', 'M', 'G', 'GG'];

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

function Pessoa({
  ficha,
  p,
  tudo,
  atualizar,
}: {
  ficha: FichaDTO;
  p: PessoaDTO;
  tudo: boolean;
  atualizar: () => void;
}) {
  const router = useRouter();
  const idFoto = useId();
  const ed = ficha.pode.inscricao;
  const base = { chave: `pessoa:${ficha.id}:${p.id}`, editavel: ed };
  const X = 'extra';
  return (
    <>
      <div className="pc-h">
        <label htmlFor={idFoto} className={ed ? 'cursor-pointer' : ''}>
          <Rostos pessoas={[p]} />
        </label>
        <div className="min-w-0">
          <b>{p.nome}</b>
          {ed && <span>Toque na foto para trocar</span>}
        </div>
        {ed && (
          <input
            id={idFoto}
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
      </div>
      <div className={`props ${tudo ? 'tudo' : ''}`}>
        <CampoPr
          {...base}
          rotulo="Nome completo"
          campo="nome"
          valor={p.nome}
          aoSalvar={atualizar}
          conversao={{ deTexto: (t) => t.trim() }}
        />
        <CampoPr
          {...base}
          rotulo="Como prefere"
          campo="apelido"
          valor={p.apelido}
          aoSalvar={atualizar}
        />
        <CampoPr
          {...base}
          rotulo="WhatsApp"
          campo="whatsapp"
          valor={p.whatsapp}
          inputMode="tel"
          conversao={TELEFONE}
          aoSalvar={atualizar}
        />
        <CampoPr
          {...base}
          rotulo="E-mail"
          campo="email"
          valor={p.email}
          tipo="email"
          conversao={EMAIL}
        />
        <CampoPr {...base} rotulo="Instagram" campo="instagram" valor={p.instagram} />
        <CampoPr
          {...base}
          rotulo="Nascimento"
          campo="nascimento"
          valor={p.nascimento}
          tipo="date"
        />
        <CampoPr {...base} rotulo="Cidade" campo="cidade" valor={p.cidade} />
        <CampoPr
          {...base}
          rotulo="UF"
          campo="uf"
          valor={p.uf}
          tipo="select"
          opcoes={opcoesDe(UFS)}
        />
        <CampoPr {...base} rotulo="Profissão" campo="profissao" valor={p.profissao} classe={X} />
        <CampoPr
          {...base}
          rotulo="Ocupação"
          campo="ocupacao"
          valor={p.ocupacao}
          tipo="select"
          classe={X}
          opcoes={OCUPACOES.map((o) => ({ valor: o, rotulo: OCUPACAO_LABEL[o] }))}
        />
        <CampoPr
          {...base}
          rotulo="Filhos"
          campo="filhosQuantidade"
          valor={p.filhosQuantidade}
          inputMode="numeric"
          classe={X}
          conversao={INTEIRO}
        />
        <CampoPr
          {...base}
          rotulo="Idades dos filhos"
          campo="filhosIdades"
          valor={p.filhosIdades}
          classe={X}
        />
        <CampoPr
          {...base}
          rotulo="Tecnologia"
          campo="tecnologia"
          valor={p.tecnologia}
          tipo="select"
          classe={X}
          opcoes={TECNOLOGIAS.map((t) => ({ valor: t, rotulo: TECNOLOGIA_LABEL[t] }))}
        />
        <CampoPr
          {...base}
          rotulo="Melhor horário"
          campo="melhorHorario"
          valor={p.melhorHorario}
          classe={X}
        />
        <CampoPr
          {...base}
          rotulo="Canal preferido"
          campo="canalPreferido"
          valor={p.canalPreferido}
          tipo="select"
          classe={X}
          opcoes={opcoesDe(CANAIS)}
        />
        <CampoPr
          {...base}
          rotulo="Pulseira"
          campo="pulseira"
          valor={p.pulseira}
          tipo="select"
          classe={X}
          opcoes={opcoesDe(PULSEIRAS)}
        />
      </div>
    </>
  );
}

function Entrega({ ficha }: { ficha: FichaDTO }) {
  const router = useRouter();
  const idFoto = useId();
  const ed = ficha.pode.inscricao;
  const chave = `endereco:${ficha.id}`;
  return (
    <>
      <h3>Entrega</h3>
      <div className="props">
        <CampoPr
          chave={chave}
          editavel={ed}
          rotulo="Endereço"
          campo="endereco"
          valor={ficha.endereco?.endereco}
          classe="longo"
        />
        <CampoPr
          chave={chave}
          editavel={ed}
          rotulo="CEP"
          campo="cep"
          valor={ficha.endereco?.cep}
          inputMode="numeric"
          conversao={CEP}
        />
        <CampoPr
          chave={chave}
          editavel={ed}
          rotulo="Veio de"
          campo="origem"
          valor={ficha.endereco?.origem ?? 'MANUAL'}
          tipo="select"
          semVazio
          opcoes={[
            { valor: 'FORMULARIO_CAIXA', rotulo: 'Formulário da Caixa' },
            { valor: 'MANUAL', rotulo: 'Manual' },
          ]}
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
              <label htmlFor={idFoto} className={`${quietButton} sm cursor-pointer`}>
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

/** Aba Pessoa(s): seletor no casal, campos em lista e os dados da entrega. */
export function FichaPessoas({ ficha, atualizar }: { ficha: FichaDTO; atualizar: () => void }) {
  const [ordem, setOrdem] = useState(0);
  const [tudo, setTudo] = useState(false);
  const p = ficha.pessoas[ordem] ?? ficha.pessoas[0]!;
  return (
    <section className="card pa" role="tabpanel" aria-label="Pessoas">
      {ficha.pessoas.length > 1 && (
        <div className="seg pessoas-seg" role="group" aria-label="Pessoa do casal">
          {ficha.pessoas.map((x, i) => (
            <button
              key={x.id}
              type="button"
              className={x.id === p.id ? 'on' : ''}
              aria-pressed={x.id === p.id}
              onClick={() => setOrdem(i)}
            >
              {x.apelido ?? x.nome}
            </button>
          ))}
        </div>
      )}
      <Pessoa key={p.id} ficha={ficha} p={p} tudo={tudo} atualizar={atualizar} />
      <button
        type="button"
        className={`${quietButton} ver-mais so-cel`}
        onClick={() => setTudo((t) => !t)}
      >
        {tudo ? 'Ver menos dados' : 'Ver todos os dados'}
      </button>
      <Entrega ficha={ficha} />
    </section>
  );
}
