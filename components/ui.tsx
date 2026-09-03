import type { ReactNode } from "react";
import type { ApiErrorKind, ApiErrorPresentation, NormalizedFieldError } from "@/lib/api";

export function StatusBadge({ label, tone = "neutral" }: { label: string; tone?: string }) { return <span className={`status status-${tone}`}>{label}</span>; }
export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) { return <div className="card empty"><div className="empty-mark" aria-hidden="true">↗</div><h2>{title}</h2><p>{children}</p>{action}</div>; }
type ErrorAlertProps=Partial<ApiErrorPresentation>&{message:string};
const errorTitle=(kind?:ApiErrorKind)=>kind==="authorization"?"Access forbidden":kind==="not-found"?"Resource not found":kind==="server"||kind==="transport"?"The service is temporarily unavailable":"We couldn’t complete that.";
export function ErrorAlert({message,code,developerMessage,requestId,kind}:ErrorAlertProps){
  const technical=Boolean(code||developerMessage||requestId);
  return <div className="alert" role="alert"><strong>{errorTitle(kind)}</strong><div>{message}</div>{technical&&<details className="support-details"><summary>Technical details</summary><dl><div><dt>Code</dt><dd>{code||"Not provided"}</dd></div>{developerMessage&&<div><dt>Developer message</dt><dd>{developerMessage}</dd></div>}<div><dt>Request ID</dt><dd>{requestId||"Not provided by the server"}</dd></div></dl></details>}</div>;
}
export function FormErrorSummary({errors,id="form-error-summary"}:{errors:NormalizedFieldError[];id?:string}){if(!errors.length)return null;return <div className="alert" id={id} role="alert" aria-labelledby={`${id}-title`} tabIndex={-1}><strong id={`${id}-title`}>Check the highlighted fields</strong><ul>{errors.map((error,index)=><li key={`${error.sourceField}-${error.rule}-${index}`}>{error.message}</li>)}</ul></div>}
export function Unavailable({ title, children }: { title: string; children: ReactNode }) { return <section className="unavailable"><span className="status status-warning">API required</span><h2>{title}</h2><p>{children}</p></section>; }
export function LoadingCards() { return <div className="stack" aria-label="Loading"><div className="skeleton" /><div className="skeleton" /></div>; }
