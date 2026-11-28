"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/**
 * A native modal dialog, opened on mount: it keeps focus inside, and Escape closes it unless an action is running
 * (then Escape is ignored). Closing is always the parent's decision through `onClose`.
 */
export function Modal({ title, isBusy = false, onClose, children, size = "md", testId }: {
  title: string;
  isBusy?: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "md" | "lg" | "xl";
  testId?: string;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const width = size === "xl" ? "max-w-5xl" : size === "lg" ? "max-w-2xl" : "max-w-md";
  return (
    <dialog
      aria-labelledby={titleId}
      className={`m-auto max-h-[92dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-950/40 ${width}`}
      data-testid={testId}
      onCancel={(event) => { event.preventDefault(); if (!isBusy) onClose(); }}
      ref={dialogRef}
    >
      <h2 className="text-lg font-semibold text-slate-950" id={titleId}>{title}</h2>
      {children}
    </dialog>
  );
}
