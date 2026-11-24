'use client';
import { MFA_LIGADO } from '@npac/shared/enums';
import { cleanProfileName, PROFILE_NAME_ERROR, type ProfileDTO } from '@npac/shared/profile';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { Avatar, AVATAR_EU } from '@/components/avatar';
import type { EmailTroca as EmailTrocaType } from '@/components/conta/email-troca';
import type { FotoRecorte as FotoRecorteType } from '@/components/conta/foto-recorte';
import { showToast } from '@/components/toast';
import { authClient } from '@/lib/auth-client';
import { clientApi } from '@/lib/client-api';
import { Erro, ICONE, Icone, Secao, Valor } from './perfil-ui';
import { Telegram } from './telegram';

// Igual ao `minPasswordLength` da API (provisório enquanto o time testa).
const SENHA_MIN = 3;

function Nome({ inicial }: { inicial: string }) {
  const router = useRouter();
  const salvo = useRef(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const erroId = useId();
  async function salvar(valor: string) {
    const nome = cleanProfileName(valor);
    if (!nome) return setErro(PROFILE_NAME_ERROR);
    setErro(null);
    if (nome === salvo.current) return;
    try {
      await clientApi<ProfileDTO>('/api/me/profile', 'PATCH', { name: nome });
      salvo.current = nome;
      showToast();
      // A sidebar e o Mais mostram o nome novo.
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-2 text-[13px] font-semibold text-ink2">
        Nome
        <input
          className="field w-full"
          name="name"
          defaultValue={inicial}
          autoComplete="name"
          maxLength={80}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? erroId : undefined}
          onBlur={(e) => void salvar(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </label>
      {erro ? (
        <Erro id={erroId}>{erro}</Erro>
      ) : (
        <span className="text-[12.5px] text-ink2">Salva sozinho quando você sai do campo.</span>
      )}
    </div>
  );
}

function Senha() {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const nova = String(f.get('new') ?? '');
    if (nova.length < SENHA_MIN)
      return setErro(`A nova senha precisa ter ${SENHA_MIN} caracteres ou mais.`);
    if (nova !== String(f.get('confirm') ?? '')) return setErro('As senhas não conferem.');
    setOcupado(true);
    setErro(null);
    const { error } = await authClient.changePassword({
      currentPassword: String(f.get('current') ?? ''),
      newPassword: nova,
      revokeOtherSessions: true,
    });
    setOcupado(false);
    if (error) return setErro('Não foi possível trocar a senha. Confira a senha atual.');
    setAberto(false);
    showToast();
  }
  if (!aberto)
    return (
      <div className="flex min-h-[50px] items-center gap-3">
        <Valor icone={ICONE.cadeado}>
          <span className="tracking-[0.14em]">••••••••</span>
        </Valor>
        <button
          type="button"
          className="btn btn-secondary ml-auto"
          aria-expanded="false"
          onClick={() => setAberto(true)}
        >
          Trocar senha
        </button>
      </div>
    );
  return (
    <form className="grid gap-3.5 md:grid-cols-2" onSubmit={salvar} aria-label="Trocar senha">
      {(
        [
          ['current', 'Senha atual', 'current-password'],
          ['new', 'Nova senha', 'new-password'],
          ['confirm', 'Confirme a nova senha', 'new-password'],
        ] as const
      ).map(([name, label, ac], i) => (
        <label
          key={name}
          className={`flex flex-col gap-2 text-[13px] font-semibold text-ink2 ${i === 0 ? 'md:col-span-2' : ''}`}
        >
          {label}
          <input
            name={name}
            type="password"
            className="field w-full"
            autoComplete={ac}
            required
            autoFocus={i === 0}
          />
        </label>
      ))}
      {erro && (
        <div className="md:col-span-2">
          <Erro>{erro}</Erro>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2.5 md:col-span-2">
        <button
          className="btn btn-primary min-h-11 px-5 text-[15px]"
          type="submit"
          disabled={ocupado}
        >
          Salvar senha
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setAberto(false);
            setErro(null);
          }}
        >
          Cancelar
        </button>
        <span className="ml-auto text-[12.5px] text-ink2">{SENHA_MIN} caracteres ou mais.</span>
      </div>
    </form>
  );
}

const FOTO_ERRO = 'Não deu para abrir essa imagem. Use JPG, PNG ou WebP.';
const FOTO_MAX_ORIGINAL = 30 * 1024 * 1024;

// Recorte só no perfil e só quando a pessoa escolhe a foto: fora do JS das outras telas.
const FotoRecorte = dynamic(() => import('./foto-recorte').then((m) => m.FotoRecorte), {
  ssr: false,
}) as typeof FotoRecorteType;

/**
 * Abre o arquivo como imagem do navegador; falha (texto, HEIC sem suporte) vira o erro da foto.
 * Por `data:` e não `blob:`: a CSP das imagens (`proxy.ts`) só aceita `'self'` e `data:`.
 */
async function abrirImagem(arquivo: File): Promise<HTMLImageElement> {
  if (arquivo.size > FOTO_MAX_ORIGINAL) throw new Error(FOTO_ERRO);
  const img = new Image();
  try {
    img.src = await new Promise<string>((ok, falha) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(String(leitor.result));
      leitor.onerror = () => falha(leitor.error);
      leitor.readAsDataURL(arquivo);
    });
    await img.decode();
  } catch {
    throw new Error(FOTO_ERRO);
  }
  return img;
}

const ICONE_CAMERA = 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z';
const ICONE_LIXO = 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13';

function Foto({
  nome,
  inicial,
  cargo,
}: {
  nome: string;
  inicial: string | null;
  cargo: React.ReactNode;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [foto, setFoto] = useState(inicial);
  const [imagem, setImagem] = useState<HTMLImageElement | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const fecharImagem = () => setImagem(null);
  async function escolher(arquivo: File | undefined) {
    if (entrada.current) entrada.current.value = '';
    if (!arquivo) return;
    setErro(null);
    try {
      setImagem(await abrirImagem(arquivo));
    } catch (e) {
      setErro((e as Error).message);
    }
  }
  async function remover() {
    setOcupado(true);
    setErro(null);
    try {
      await clientApi('/api/me/photo', 'DELETE');
      setFoto(null);
      showToast();
      router.refresh();
    } catch (e) {
      setErro((e as Error).message);
    }
    setOcupado(false);
  }
  return (
    <div className="flex flex-col items-center gap-3.5 lg:flex-row lg:gap-5">
      <Avatar
        name={nome}
        photo={foto}
        className={`${AVATAR_EU} size-[108px] text-[40px] font-bold shadow-[0_0_0_3px_rgba(255,255,255,.85),0_12px_28px_-12px_rgba(0,0,0,.45)] lg:size-[88px] lg:text-[32px] dark:shadow-[0_0_0_3px_rgba(255,255,255,.14),0_12px_28px_-12px_rgba(0,0,0,.8)]`}
      />
      <div className="text-center lg:hidden">
        <b className="block text-xl leading-[26px] font-bold tracking-[-0.02em]">{nome}</b>
        <span className="mt-1.5 inline-flex">{cargo}</span>
      </div>
      <div className="flex w-full flex-col gap-2.5 lg:w-auto">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-2 lg:flex">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => entrada.current?.click()}
          >
            <Icone d={ICONE_CAMERA} className="size-[18px]" />
            {foto ? 'Trocar foto' : 'Adicionar foto'}
          </button>
          {foto && (
            <button
              type="button"
              className="btn btn-ghost text-ink2 max-lg:shadow-[inset_0_0_0_1px_var(--line)]"
              disabled={ocupado}
              onClick={() => void remover()}
            >
              <Icone d={ICONE_LIXO} className="size-[18px]" />
              Remover
            </button>
          )}
        </div>
        <input
          ref={entrada}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Escolher foto"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => void escolher(e.currentTarget.files?.[0])}
        />
        {erro ? (
          <Erro>{erro}</Erro>
        ) : (
          <p className="text-center text-[12.5px] text-ink2 lg:text-left">
            JPG, PNG ou WebP. Você recorta em círculo antes de salvar.
          </p>
        )}
      </div>
      {imagem && (
        <FotoRecorte
          img={imagem}
          onClose={fecharImagem}
          onSaved={(url) => {
            fecharImagem();
            setFoto(url);
            showToast();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// Janelinha do código só quando a pessoa pede a troca: fora do JS das outras telas.
const EmailTroca = dynamic(() => import('./email-troca').then((m) => m.EmailTroca), {
  ssr: false,
}) as typeof EmailTrocaType;

/** E-mail: troca com código no endereço novo; sem envio configurado, pede à liderança (2A). */
function Email({ inicial, ligado }: { inicial: string; ligado: boolean }) {
  const [email, setEmail] = useState(inicial);
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <div className="flex min-h-[50px] flex-wrap items-center gap-3">
        <Valor icone={ICONE.email}>{email}</Valor>
        {ligado && (
          <button
            type="button"
            className="btn btn-secondary max-md:w-full md:ml-auto"
            onClick={() => setAberto(true)}
          >
            Trocar e-mail
          </button>
        )}
      </div>
      {!ligado && (
        <p className="flex items-start gap-2.5 rounded-[14px] bg-white/40 px-3.5 py-3 text-[13.5px] leading-[19px] text-ink2 shadow-[inset_0_0_0_0.5px_rgba(60,60,67,.18)] dark:bg-white/[0.05]">
          <Icone d={ICONE.alerta} className="mt-0.5 size-4" />
          Para trocar o e-mail, peça à liderança. Ela muda no Admin.
        </p>
      )}
      {aberto && (
        <EmailTroca
          atual={email}
          onClose={() => setAberto(false)}
          onSaved={(novo) => {
            setAberto(false);
            setEmail(novo);
            showToast();
          }}
        />
      )}
    </>
  );
}

/** Tela Meu perfil (NPAC-53): foto, nome, usuário, e-mail, senha e o aparelho. */
export function Perfil({ profile, cargo }: { profile: ProfileDTO; cargo: React.ReactNode }) {
  return (
    <>
      <Secao
        titulo="Foto e nome"
        texto="Aparecem na sidebar, no Chat, na Equipe e nas listas do Acompanhamento."
      >
        <Foto nome={profile.name} inicial={profile.photo} cargo={cargo} />
        <Nome inicial={profile.name} />
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] font-semibold text-ink2">Usuário</span>
          <span className="flex min-h-9 items-center gap-2.5">
            <Valor icone={ICONE.cadeado}>{profile.username}</Valor>
            <span className="text-[12.5px] text-ink2">É o seu login.</span>
          </span>
        </div>
      </Secao>

      <Secao titulo="E-mail" texto="Recebe o link do “Esqueci minha senha”.">
        <Email inicial={profile.email} ligado={profile.mailEnabled} />
      </Secao>

      <Secao titulo="Senha" texto="Ao trocar, os outros aparelhos saem da conta.">
        <Senha />
      </Secao>

      {profile.telegram && (
        <Secao
          titulo="Avisos pelo Telegram"
          texto="Os mesmos avisos do CRM, na hora, no seu Telegram."
        >
          <Telegram inicial={profile.telegram} />
        </Secao>
      )}

      <Secao titulo="Este aparelho" texto="Vale só para este navegador.">
        <div className="flex flex-col gap-2">
          {(
            [
              ['/conta/avisos', 'Avisos neste aparelho', ICONE.sino],
              ...(MFA_LIGADO ? ([['/conta/mfa', 'Autenticador', ICONE.cadeado]] as const) : []),
            ] as const
          ).map(([href, rotulo, icone]) => (
            <Link
              key={href}
              href={href}
              className="flex min-h-14 items-center gap-3 rounded-[14px] bg-white/50 px-4 font-semibold shadow-[inset_0_0_0_0.5px_rgba(60,60,67,.2)] transition-colors hover:bg-white/80 dark:bg-white/[0.05] dark:hover:bg-white/10"
            >
              <span className="grid size-[34px] flex-none place-items-center rounded-[10px] bg-black/5 dark:bg-white/10">
                <Icone d={icone} className="size-[18px]" />
              </span>
              {rotulo}
              <Icone d={ICONE.seta} className="ml-auto size-[18px] text-ink3" />
            </Link>
          ))}
        </div>
      </Secao>
    </>
  );
}
