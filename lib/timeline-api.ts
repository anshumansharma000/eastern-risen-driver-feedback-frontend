import { ApiError, apiRequest } from './api.ts';
import { parsePaginatedResponse } from './pagination.ts';
import type { DataResponse, PaginatedResponse } from './contracts.ts';
import type { AccessMethod, DriverBookingContext, CreateTimelineEvent, TimelineReceipt, TimelineEvent, PhotoUploadIntent, PhotoUploadResponse, CompletedPhoto, PrivatePhotoUrl, TripOverviewRow, IssuedDriverLink, OperationalStatus } from './timeline-types.ts';
export const publicDriverRoute = '/driver-booking/';
const activeKey = 'feedback.timeline.link.active';
const sessionKey = (instance: string, field: 'credential' | 'scope') => `feedback.timeline.link.${instance}.${field}`;
export function rememberedDriverScope(): string {
    try { const instance = sessionStorage.getItem(activeKey); return instance ? sessionStorage.getItem(sessionKey(instance, 'scope')) || '' : ''; }
    catch { return ''; }
}
export function rememberDriverScope(scope: string): void {
    try { const instance = sessionStorage.getItem(activeKey); if (instance) sessionStorage.setItem(sessionKey(instance, 'scope'), scope); }
    catch { /* Memory-only access remains usable when session storage is disabled. */ }
}
/** Run before context requests or analytics. Credentials never enter durable stores. */
export function consumeDriverToken(location: Pick<Location, 'hash' | 'pathname' | 'search'>, history: Pick<History, 'replaceState'>, storage: Pick<Storage, 'getItem' | 'setItem'>): string | null {
    const token = new URLSearchParams(location.hash.slice(1)).get('token');
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    if (token) {
        try {
            const old = storage.getItem(activeKey);
            const instance = crypto.randomUUID();
            storage.setItem(sessionKey(instance, 'credential'), token);
            storage.setItem(activeKey, instance);
            if (old && 'removeItem' in storage) {
                (storage as Storage).removeItem(sessionKey(old, 'credential'));
                (storage as Storage).removeItem(sessionKey(old, 'scope'));
            }
        } catch { /* Keep the fragment credential in memory only. */ }
        return token;
    }
    try { const instance = storage.getItem(activeKey); return instance ? storage.getItem(sessionKey(instance, 'credential')) : null; }
    catch { return null; }
}
export function clearDriverToken(): void {
    const instance = sessionStorage.getItem(activeKey);
    if (instance) { sessionStorage.removeItem(sessionKey(instance, 'credential')); sessionStorage.removeItem(sessionKey(instance, 'scope')); }
    sessionStorage.removeItem(activeKey);
}
export interface TimelineAccess {
    method: AccessMethod;
    context(bookingId?: string): Promise<DriverBookingContext>;
    events(bookingId: string, page: number): Promise<PaginatedResponse<TimelineEvent>>;
    submit(body: CreateTimelineEvent): Promise<TimelineReceipt>;
    intent(body: PhotoUploadIntent): Promise<PhotoUploadResponse>;
    complete(id: string): Promise<CompletedPhoto>;
    photo(id: string): Promise<PrivatePhotoUrl>;
}
const enc = encodeURIComponent;
export function driverTimelineAccess(method: AccessMethod, token?: string): TimelineAccess {
    if (method === 'LINK' && !token)
        throw new Error('A current booking link is required.');
    const base = method === 'LINK' ? '/api/v1/driver-link/timeline' : '/api/v1/driver/timeline';
    const request = <T>(path: string, init: RequestInit = {}) => apiRequest<T>(base + path, { ...init, cache: 'no-store', ...(method === 'LINK' ? { driverLinkToken: token } : {}) });
    const data = async <T>(path: string, init?: RequestInit) => (await request<DataResponse<T>>(path, init)).data;
    return { method, context: id => data(method === 'LINK' ? '/context' : `/bookings/${enc(id || '')}/context`), events: async (id, page) => parsePaginatedResponse<TimelineEvent>(await request(`/bookings/${enc(id)}/events?page=${page}&pageSize=25`)), submit: body => data('/events', { method: 'POST', body: JSON.stringify(body) }), intent: body => data('/photo-uploads', { method: 'POST', body: JSON.stringify(body) }), complete: id => data(`/photo-uploads/${enc(id)}/complete`, { method: 'POST' }), photo: id => data(`/photos/${enc(id)}/url`) };
}
const adminBase = '/api/v1/admin/timeline';
const adminData = async <T>(path: string, init?: RequestInit) => (await apiRequest<DataResponse<T>>(adminBase + path, { ...init, cache: 'no-store' })).data;
export const adminTimeline = {
    trips: async (page = 1, bookingId?: string, pageSize = 25) => parsePaginatedResponse<TripOverviewRow>(await apiRequest(adminBase + `/trips?page=${page}&pageSize=${pageSize}${bookingId ? `&bookingId=${enc(bookingId)}` : ''}`, { cache: 'no-store' })),
    events: async (id: string, page: number) => parsePaginatedResponse<TimelineEvent>(await apiRequest(adminBase + `/bookings/${enc(id)}/events?page=${page}&pageSize=25`, { cache: 'no-store' })),
    link: (booking: string, driver: string, body: {
        expiresAt?: string;
        regenerate?: boolean;
    } = {}) => adminData<IssuedDriverLink>(`/bookings/${enc(booking)}/drivers/${enc(driver)}/link`, { method: 'POST', body: JSON.stringify(body) }),
    revoke: (booking: string, driver: string) => apiRequest<void>(adminBase + `/bookings/${enc(booking)}/drivers/${enc(driver)}/link`, { method: 'DELETE', cache: 'no-store' }),
    progress: (id: string, status: Exclude<OperationalStatus, 'UNKNOWN'>, reason: string) => adminData<{
        tripId: string;
        status: OperationalStatus;
    }>(`/trips/${enc(id)}/progress`, { method: 'PATCH', body: JSON.stringify({ status, reason }) }),
    photo: (id: string) => adminData<PrivatePhotoUrl>(`/photos/${enc(id)}/url`),
};
/** Storage requests never inherit API headers, cookies or bearer credentials. */
export async function putTimelinePhoto(intent: PhotoUploadResponse, blob: Blob): Promise<void> {
    let response: Response;
    try {
        response = await fetch(intent.uploadUrl, {
            method: intent.method, headers: intent.headers, body: blob,
            credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(30_000)
        });
    } catch {
        throw new ApiError(0, 'NETWORK_FAILURE', 'The photo upload could not reach storage. Your selected photo is still saved.', undefined, undefined, 'transport', { retryable: true });
    }
    if (!response.ok) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? (Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now())) : undefined;
        throw new ApiError(response.status, 'TIMELINE_PHOTO_UPLOAD_FAILED', 'The photo upload failed. Retry or remove the photo before sending.', undefined, undefined, response.status === 429 ? 'rate-limit' : response.status >= 500 ? 'server' : 'protocol', {
            retryable: response.status === 429 || response.status >= 500,
            retryAfterMs: Number.isFinite(delay) ? delay : undefined
        });
    }
}
