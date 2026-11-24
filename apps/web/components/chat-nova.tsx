'use client';
import { useEffect, useRef, useState } from 'react';
import type { Role } from '@npac/shared';
import { closeWithMotion } from '@/lib/dialog-motion';
import { Avatar, AVATAR_OUTRO, type TeamPhotos } from './avatar';
import { RoleTag } from './role-tag';
import { icBusca, icX } from './chat-icons';

export type ChatUser = { id: string; name: string; role: string };

/** Sem acento e minúsculo: "Sônia" acha com "sonia". */
const simples = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Folha "Nova conversa" (redesign A1, decisão 3A): a lista de pessoas com o cargo e o filtro
 * "Buscar pessoa", só na tela. No celular sobe de baixo; no tablet e no computador, no meio.
 */
export function NovaConversa({
  users,
  photos,
  onPick,
  onClose,
}: {
  users: ChatUser[];
  photos: TeamPhotos;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busca, setBusca] = useState('');
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  const fechar = () => closeWithMotion(ref.current, onClose);
  const termo = simples(busca);
  const lista = termo ? users.filter((u) => simples(u.name).includes(termo)) : users;

  return (
    <dialog
      ref={ref}
      className="dlg ch-folha"
      aria-labelledby="ch-nova-titulo"
      onCancel={(e) => {
        e.preventDefault();
        fechar();
      }}
      onClick={(e) => {
        // Toque no véu (fora da folha) fecha.
        const r = ref.current?.getBoundingClientRect();
        const dentro =
          r &&
          e.clientX >= r.left &&
          e.clientX <= r.right &&
          e.clientY >= r.top &&
          e.clientY <= r.bottom;
        if (e.target === ref.current && !dentro) fechar();
      }}
    >
      <div className="ch-fc">
        <button type="button" className="ch-circ ch-vidro" aria-label="Fechar" onClick={fechar}>
          {icX}
        </button>
        <h2 id="ch-nova-titulo">Nova conversa</h2>
      </div>
      <label className="ch-busca">
        {icBusca}
        <input
          type="search"
          className="ch-campo"
          aria-label="Buscar pessoa"
          placeholder="Buscar pessoa"
          autoComplete="off"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </label>
      <div className="ch-pessoas">
        {lista.length ? (
          <ul>
            {lista.map((u) => (
              <li key={u.id}>
                <button type="button" className="ch-pessoa" onClick={() => onPick(u.id)}>
                  <Avatar
                    name={u.name}
                    photo={photos.photos[u.id]}
                    className={`${AVATAR_OUTRO} ch-av`}
                  />
                  <span className="ch-nm">{u.name}</span>
                  <RoleTag role={u.role as Role} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status">Nenhuma pessoa encontrada</p>
        )}
      </div>
    </dialog>
  );
}
