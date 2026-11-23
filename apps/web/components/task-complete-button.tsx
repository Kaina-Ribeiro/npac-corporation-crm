'use client';
import type { LeadCatalog } from '@npac/shared';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import type { TaskToComplete } from './task-complete-dialog';

// Só no clique: a janelinha não pesa no JS da ficha.
const TaskCompleteDialog = dynamic(
  () => import('./task-complete-dialog').then((m) => m.TaskCompleteDialog),
  { ssr: false },
);

/**
 * "Concluir" das Tarefas da ficha (NPAC-67, Igor 23/11/2026, 2.2A): abre a mesma janelinha do Hoje,
 * que pede o que aconteceu e o próximo passo.
 */
export function TaskCompleteButton({
  task,
  team,
  defaultCloserId,
  className,
  disabled,
  onSaved,
}: {
  task: TaskToComplete;
  team: LeadCatalog['team'];
  defaultCloserId?: string | null;
  className: string;
  disabled?: boolean;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled}
        aria-label={`Concluir ${task.title}`}
        onClick={() => setOpen(true)}
      >
        Concluir
      </button>
      {open && (
        <TaskCompleteDialog
          task={task}
          team={team}
          defaultCloserId={defaultCloserId}
          onSaved={onSaved}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
