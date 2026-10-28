import { ApiError } from './api.ts';
import { putTimelinePhoto, type TimelineAccess } from './timeline-api.ts';
import { accessScope, assignmentProblem, timelineError, validateEntry } from './timeline-rules.ts';
import type { CreateTimelineEvent, DriverBookingContext, PhotoUploadResponse, TimelineReceipt } from './timeline-types.ts';
export interface QueuedPhoto {
    blob: Blob;
    intent?: PhotoUploadResponse;
    readyId?: string;
}
export interface TimelineQueueItem {
    formatVersion: 1;
    id: string;
    scope: string;
    bookingId: string;
    draft: CreateTimelineEvent;
    envelope?: CreateTimelineEvent;
    photos: QueuedPhoto[];
    receipt?: TimelineReceipt;
    state: 'Queued' | 'Sending' | 'Sent' | 'Upload failed' | 'Needs attention';
    attempts: number;
    nextAttemptAt: number;
    problem?: string;
}
export interface TimelineStore {
    list(): Promise<TimelineQueueItem[]>;
    put(item: TimelineQueueItem): Promise<void>;
    remove(id: string): Promise<void>;
}
const DB = 'feedback-driver-timeline';
function openDb(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => { r.result.createObjectStore('entries', { keyPath: 'id' }); r.result.createObjectStore('locks'); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(new Error('Device storage is unavailable. Enable browser storage before saving updates.')); }); }
async function operation<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction('entries', mode); const request = action(tx.objectStore('entries')); let result: T; request.onsuccess = () => { result = request.result; }; tx.oncomplete = () => { db.close(); resolve(result); }; tx.onerror = () => { db.close(); reject(new Error('Device storage is full or unavailable. Your entry has not been queued.')); }; tx.onabort = () => { db.close(); reject(new Error('Saving to this device failed.')); }; }); }
/** A transactional freeze guard also protects against a suspended fallback-lease holder. */
async function persist(item: TimelineQueueItem): Promise<void> {
    const db = await openDb();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('entries', 'readwrite');
        const store = tx.objectStore('entries');
        const request = store.get(item.id);
        let conflict = false;
        request.onsuccess = () => {
            const existing = request.result as TimelineQueueItem | undefined;
            if (existing?.envelope && JSON.stringify(existing.envelope) !== JSON.stringify(item.envelope)) {
                conflict = true;
                tx.abort();
                return;
            }
            // An older worker must never erase an accepted receipt.
            if (existing?.receipt && !item.receipt) return;
            store.put(item);
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = tx.onerror = () => {
            db.close();
            reject(new Error(conflict ? 'Another tab already froze this update. Reload and resolve the existing attempt before editing.' : 'Device storage is unavailable. The update has not been saved.'));
        };
    });
}
export const timelineStore: TimelineStore = {
    list: () => operation('readonly', s => s.getAll()),
    put: persist,
    remove: async (id) => { await operation('readwrite', s => s.delete(id)); }
};
// IndexedDB transactional lease backs up Web Locks on browsers without that API.
async function lease(owner: string, release = false): Promise<boolean> { const db = await openDb(); return new Promise((resolve, reject) => { const tx = db.transaction('locks', 'readwrite'); const store = tx.objectStore('locks'); const r = store.get('worker'); let acquired = false; r.onsuccess = () => { const current = r.result as {
    owner: string;
    until: number;
} | undefined; if (release) {
    if (current?.owner === owner)
        store.delete('worker');
}
else if (!current || current.owner === owner || current.until < Date.now()) {
    store.put({ owner, until: Date.now() + 120000 }, 'worker');
    acquired = true;
} }; tx.oncomplete = () => { db.close(); resolve(acquired); }; tx.onerror = () => { db.close(); reject(tx.error); }; }); }
export async function withTimelineLock<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (typeof navigator !== 'undefined' && navigator.locks)
        return navigator.locks.request(DB, { ifAvailable: true }, lock => lock ? work() : Promise.resolve(undefined));
    const owner = crypto.randomUUID();
    if (!await lease(owner))
        return;
    const renewal = setInterval(() => void lease(owner), 30000);
    try {
        return await work();
    }
    finally {
        clearInterval(renewal);
        await lease(owner, true);
    }
}
export function newQueueItem(scope: string, bookingId: string, draft: CreateTimelineEvent, blobs: Blob[]): TimelineQueueItem { return { formatVersion: 1, id: draft.clientEventId, scope, bookingId, draft: structuredClone(draft), photos: blobs.map(blob => ({ blob })), state: 'Queued', attempts: 0, nextAttemptAt: 0 }; }
export function freezeEntry(item: TimelineQueueItem): CreateTimelineEvent {
    if (item.envelope)
        return item.envelope;
    if (item.photos.some(p => !p.readyId))
        throw new Error('All selected photos must be verified before sending.');
    return { ...item.draft, ...(item.photos.length ? { photoIds: item.photos.map(p => p.readyId!) } : {}) };
}
export function exportEntry(item: TimelineQueueItem) { return JSON.stringify({ state: item.state, problem: item.problem, update: item.envelope || item.draft }, null, 2); }
/** Exact persisted bodies are replayed; credentials only exist in the access adapter. */
export async function processTimelineQueue(access: TimelineAccess, bookingId: string, store: TimelineStore = timelineStore, upload = putTimelinePhoto, onChange = () => { }, expectedScope?: string) {
    const items = (await store.list()).filter(i => i.bookingId === bookingId && i.draft && i.state !== 'Sent');
    let context: DriverBookingContext;
    try {
        context = await access.context(bookingId);
    }
    catch (error) {
        if (expectedScope && error instanceof ApiError && !error.retryable)
            for (const item of items.filter(i => i.scope === expectedScope)) {
                item.state = 'Needs attention';
                item.problem = timelineError(error);
                await store.put(item);
            }
        if (expectedScope && error instanceof ApiError && error.retryable) {
            for (const item of items.filter(i => i.scope === expectedScope && !i.envelope)) {
                item.draft.submissionMode = 'OFFLINE_SYNC';
                await store.put(item);
            }
        }
        // Without a verified identity scope, never mutate another access identity’s queue.
        onChange();
        throw error;
    }
    const scope = accessScope(access.method, context.driverId, context.booking.id);
    const blocked = new Set<string>();
    for (const item of items.filter(i => i.scope === scope).sort((a, b) => a.draft.occurredAt.localeCompare(b.draft.occurredAt) || a.draft.recordedAt.localeCompare(b.draft.recordedAt) || a.id.localeCompare(b.id))) {
        if (blocked.has(item.draft.tripId))
            continue;
        if (item.state === 'Needs attention' || item.state === 'Upload failed' || item.nextAttemptAt > Date.now()) {
            blocked.add(item.draft.tripId);
            continue;
        }
        const problem = assignmentProblem(item.envelope || item.draft, context) || (!item.envelope ? validateEntry(item.draft, context.booking.startsAt, item.photos.length) : null);
        if (problem) {
            item.state = 'Needs attention';
            item.problem = problem;
            await store.put(item);
            blocked.add(item.draft.tripId);
            continue;
        }
        item.state = 'Sending';
        await store.put(item);
        onChange();
        try {
            if (!item.envelope) {
                for (const photo of item.photos) {
                    if (photo.readyId)
                        continue;
                    if (!photo.intent || Date.parse(photo.intent.expiresAt) <= Date.now()) {
                        photo.intent = await access.intent({ tripId: item.draft.tripId, assignmentVersion: item.draft.assignmentVersion, contentType: photo.blob.type as 'image/jpeg' | 'image/png' | 'image/webp', sizeBytes: photo.blob.size });
                        await store.put(item);
                    }
                    if (photo.blob.size > photo.intent.maxBytes)
                        throw new Error('The photo is too large. Remove it or choose a smaller image.');
                    await upload(photo.intent, photo.blob);
                    const verified = await access.complete(photo.intent.id);
                    if (verified.status !== 'READY')
                        throw new Error('This photo cannot be attached. Remove it and choose another image.');
                    photo.readyId = verified.id;
                    await store.put(item);
                }
                item.envelope = freezeEntry(item);
                await store.put(item);
            }
            item.receipt = await access.submit(item.envelope);
            item.state = 'Sent';
            item.photos = [];
            item.problem = undefined;
            await store.put(item);
            onChange();
            // Obtain authoritative progress/version before processing the next milestone.
            context = await access.context(bookingId);
        }
        catch (error) {
            if (item.receipt) {
                onChange();
                break;
            }
            item.attempts++;
            const retry = error instanceof ApiError ? error.retryable : false;
            if (!item.envelope && retry)
                item.draft.submissionMode = 'OFFLINE_SYNC';
            item.state = retry && item.attempts < 8 ? 'Queued' : !item.envelope ? 'Upload failed' : 'Needs attention';
            item.problem = timelineError(error);
            item.nextAttemptAt = Date.now() + Math.max(error instanceof ApiError ? error.retryAfterMs || 0 : 0, Math.min(300000, 2000 * 2 ** item.attempts) * (0.75 + Math.random() * 0.5));
            await store.put(item);
            blocked.add(item.draft.tripId);
            onChange();
        }
    }
    onChange();
    return context;
}
export async function syncTimelineQueue(access: TimelineAccess, bookingId: string, onChange?: () => void, scope?: string) { return withTimelineLock(() => processTimelineQueue(access, bookingId, timelineStore, putTimelinePhoto, onChange, scope)); }
export async function retryTimelineItem(id: string) { return withTimelineLock(async () => { const item = (await timelineStore.list()).find(i => i.id === id); if (item && item.state !== 'Sent') {
    item.state = 'Queued';
    item.nextAttemptAt = 0;
    item.attempts = 0;
    await timelineStore.put(item);
} }); }
export async function removeQueuedPhoto(id: string, index: number) { return withTimelineLock(async () => { const item = (await timelineStore.list()).find(i => i.id === id); if (!item || item.envelope)
    throw new Error('Resolve the existing submission before changing attachments.'); item.photos.splice(index, 1); item.state = 'Queued'; item.nextAttemptAt = 0; await timelineStore.put(item); }); }
