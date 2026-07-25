"use client";

import type { ReactNode } from "react";
import { Modal } from "./modal";

export function AlertDialog({
  title,
  children,
  confirmLabel,
  busy = false,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return <Modal onDismiss={() => !busy && onCancel()}>
    <section className="dialog alert-dialog" role="alertdialog" aria-modal="true" aria-labelledby="alert-dialog-title" aria-describedby="alert-dialog-description">
      <span className="eyebrow">{destructive ? "Please confirm" : "Final review"}</span>
      <h2 id="alert-dialog-title" tabIndex={-1}>{title}</h2>
      <div id="alert-dialog-description">{children}</div>
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" className={`button${destructive ? " button-danger" : ""}`} disabled={busy} onClick={onConfirm}>{busy ? "Working…" : confirmLabel}</button>
      </div>
    </section>
  </Modal>;
}
