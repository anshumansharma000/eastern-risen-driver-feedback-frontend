export function canRetry(status: number, kind: string): boolean {
  if (kind === "transport" || kind === "server") return true;
  if (kind === "rate-limit" || status === 429) return true;
  return false;
}

export function backoffDelay(attempt: number): number {
  const bounded = Math.max(0, Math.min(attempt, 8));
  return Math.min(300_000, 2_000 * 2 ** bounded);
}
