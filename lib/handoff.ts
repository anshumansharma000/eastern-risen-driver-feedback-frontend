let token: string | null = null;
let expiresAt: string | null = null;
export function setHandoff(nextToken: string, nextExpiry: string) { token = nextToken; expiresAt = nextExpiry; }
export function getHandoff() { return token && expiresAt ? { token, expiresAt } : null; }
export function clearHandoff() { token = null; expiresAt = null; }
