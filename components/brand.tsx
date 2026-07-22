import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="Eastern Risen home">
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span><strong>Eastern Risen</strong>{!compact && <small>Expedition · Feedback</small>}</span>
    </Link>
  );
}
