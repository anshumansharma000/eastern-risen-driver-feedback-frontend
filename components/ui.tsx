import type { ReactNode } from "react";

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: string }) { return <span className={`status status-${tone}`}>{label}</span>; }
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) { return <div className="card empty"><div className="empty-mark" aria-hidden="true">↗</div><h2>{title}</h2><p>{children}</p>{action}</div>; }
export function ErrorAlert({ message, requestId }: { message: string; requestId?: string }) { return <div className="alert" role="alert"><strong>We couldn’t complete that.</strong><div>{message}</div>{requestId && <details className="support-details"><summary>Support details</summary><small>Request ID: {requestId}</small></details>}</div>; }
export function Unavailable({ title, children }: { title: string; children: ReactNode }) { return <section className="unavailable"><span className="status status-warning">API required</span><h2>{title}</h2><p>{children}</p></section>; }
export function LoadingCards() { return <div className="stack" aria-label="Loading"><div className="skeleton" /><div className="skeleton" /></div>; }
