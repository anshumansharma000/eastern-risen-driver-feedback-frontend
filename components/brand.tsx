import Link from "next/link";

export function Brand({ compact = false, href = "/" }: { compact?: boolean; href?: string }) {
  return (
    <Link className="brand" href={href} aria-label={href === "/" ? "Eastern Risen home" : "Eastern Risen driver home"}>
      <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
      <span><strong>Eastern Risen</strong>{!compact && <small>Expedition · Feedback</small>}</span>
    </Link>
  );
}
