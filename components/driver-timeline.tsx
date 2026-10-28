"use client";
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ApiError, getPaginated } from '@/lib/api';
import type { CreateTimelineEvent, DriverBookingContext, EventLocation, TimelineEvent, TimelineEventType } from '@/lib/timeline-types';
import { clearDriverToken, consumeDriverToken, rememberedDriverScope, rememberDriverScope, driverTimelineAccess, type TimelineAccess } from '@/lib/timeline-api';
import { accessScope, actionsFor, nextMilestone, eventLabels, progressLabels, timelineError, validateEntry, validLocation } from '@/lib/timeline-rules';
import { exportEntry, newQueueItem, removeQueuedPhoto, retryTimelineItem, syncTimelineQueue, timelineStore, withTimelineLock, type TimelineQueueItem } from '@/lib/timeline-queue';
import { formatDateTime, formatTripRange } from '@/lib/timeline-time';
import { Modal } from './modal';
import { TimelineFeed, useVisibleRefresh } from './timeline-feed';
interface AssignedBooking {
    id: string;
    bookingReference: string;
    passengerName: string;
    startsAt: string;
    endsAt: string;
    status: 'ACTIVE' | 'COMPLETED';
}
export function DriverBookingList() {
    const [rows, setRows] = useState<AssignedBooking[]>([]), [page, setPage] = useState(1), [total, setTotal] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(true);
    const load = useCallback(async () => { setBusy(true); try {
        const r = await getPaginated<AssignedBooking>(`/api/v1/driver/timeline/bookings?page=${page}&pageSize=25`, { cache: 'no-store' });
        setRows(r.data);
        setTotal(r.pagination.total);
        setError('');
    }
    catch (e) {
        setError(timelineError(e));
    }
    finally {
        setBusy(false);
    } }, [page]);
    useEffect(() => { queueMicrotask(() => void load()); }, [load]);
    useVisibleRefresh(load);
    return <main className="page"><div className="page-header"><div><p className="eyebrow">Driver reporting</p><h1>Trip updates</h1><p>Choose a booking to record progress and view your updates.</p></div></div>{error && <p className="alert" role="alert">{error}</p>}<button className="button button-secondary" onClick={() => void load()} disabled={busy}>Refresh bookings</button>{busy ? <p>Loading bookings…</p> : !rows.length && !error ? <p>No assigned bookings.</p> : null}<div className="trip-list">{rows.map(b => <article className="card card-pad" key={b.id}><h2>{b.bookingReference}</h2><p>{b.passengerName}</p><p>{formatTripRange(b.startsAt, b.endsAt)}</p><Link className="button" href={`/driver/bookings/detail?bookingId=${encodeURIComponent(b.id)}`}>Open trip updates</Link></article>)}</div><div className="dialog-actions"><button className="button button-secondary" disabled={page === 1 || busy} onClick={() => setPage(p => p - 1)}>Previous</button><span>Page {page}</span><button className="button button-secondary" disabled={page * 25 >= total || busy} onClick={() => setPage(p => p + 1)}>Next</button></div></main>;
}
export function DriverBookingRoute() { const id = useSearchParams().get('bookingId'); const access = useMemo(() => driverTimelineAccess('LOGIN'), []); return id ? <DriverBooking access={access} bookingId={id}/> : <main className="page"><p>Choose a booking from <Link href="/driver/bookings">Trip updates</Link>.</p></main>; }
export function PublicDriverBooking() {
    const [access, setAccess] = useState<TimelineAccess | null>(null), [error, setError] = useState(''), [initialScope, setInitialScope] = useState('');
    useEffect(() => { queueMicrotask(() => { try {
        let storage: Pick<Storage, 'getItem' | 'setItem'>;
        try { storage = window.sessionStorage; }
        catch { storage = { getItem: () => null, setItem: () => {} }; }
        const token = consumeDriverToken(window.location, window.history, storage);
        if (token) {
            setInitialScope(rememberedDriverScope());
            setAccess(driverTimelineAccess('LINK', token));
        }
        else
            setError('This booking link is unavailable. Ask your admin for a current driver booking link.');
    }
    catch {
        setError('Session storage is unavailable. Enable session storage and reopen your booking link.');
    } }); }, []);
    return access ? <DriverBooking access={access} initialScope={initialScope}/> : <main className="page"><h1>Driver booking link</h1><p role="status">{error || 'Opening secure access…'}</p></main>;
}
function DriverBooking({ access, bookingId, initialScope = '' }: {
    access: TimelineAccess;
    bookingId?: string;
    initialScope?: string;
}) {
    const [context, setContext] = useState<DriverBookingContext | null>(null), [selected, setSelected] = useState(''), [composer, setComposer] = useState<CreateTimelineEvent | null>(null), [error, setError] = useState(''), [unavailable, setUnavailable] = useState(false), [items, setItems] = useState<TimelineQueueItem[]>([]), [scope, setScope] = useState(initialScope), [refreshKey, setRefreshKey] = useState(0), [busy, setBusy] = useState(false), [offline, setOffline] = useState(false), [cleared, setCleared] = useState(false), [updated, setUpdated] = useState(''), [now, setNow] = useState(0), [lastSavedId, setLastSavedId] = useState('');
    const [history, setHistory] = useState<{events: TimelineEvent[]; available: boolean}>({events: [], available: false});
    const receiveHistory = useCallback((events: TimelineEvent[], available: boolean) => setHistory({events, available}), []);
    const contextRef = useRef<DriverBookingContext | null>(null), syncing = useRef(false), saving = useRef(false), composerRef = useRef<CreateTimelineEvent | null>(null);
    useEffect(() => { composerRef.current = composer; }, [composer]);
    const refreshQueue = useCallback(async () => { try {
        setItems((await timelineStore.list()).filter(i => i.scope === scope));
    }
    catch (e) {
        setError(timelineError(e));
    } }, [scope]);
    const reload = useCallback(async () => {
        try {
            const next = await access.context(bookingId);
            if (next.accessMethod !== access.method)
                throw new Error('The service returned inconsistent driver access.');
            const draft = composerRef.current;
            if (draft && !next.trips.some(t => t.id === draft.tripId && t.assignmentVersion === draft.assignmentVersion)) {
                setComposer(null);
                setError('Your assignment changed. Reopen an action for the current trip. Saved updates remain available for review.');
            }
            else
                setError('');
            contextRef.current = next;
            setContext(next);
            const identity = accessScope(access.method, next.driverId, next.booking.id);
            setScope(identity);
            if (access.method === 'LINK')
                rememberDriverScope(identity);
            setSelected(previous => next.trips.some(t => t.id === previous) ? previous : next.trips.find(t => !['COMPLETED', 'CANCELLED'].includes(t.operationalStatus))?.id || next.trips[0]?.id || '');
            setUnavailable(false);
            setUpdated(new Date().toISOString());
            setNow(Date.now());
            return next;
        }
        catch (e) {
            setError(timelineError(e));
            if (e instanceof ApiError && !e.retryable) {
                setUnavailable(true);
                setContext(null);
                contextRef.current = null;
                setComposer(null);
            }
            return null;
        }
    }, [access, bookingId]);
    const sync = useCallback(async (manual = false) => { if (syncing.current || cleared)
        return; syncing.current = true; setBusy(true); try {
        if(manual)for(const item of (await timelineStore.list()).filter(i=>i.scope===scope&&(i.state==="Queued"||i.state==="Upload failed")))await retryTimelineItem(item.id);
        await syncTimelineQueue(access, bookingId || contextRef.current?.booking.id || '', () => void refreshQueue(), scope);
        await reload();
        setRefreshKey(k => k + 1);
    }
    catch (e) {
        setError(timelineError(e));
        if (e instanceof ApiError && !e.retryable) {
            setUnavailable(true);
            setContext(null);
            contextRef.current = null;
        }
    }
    finally {
        await refreshQueue();
        syncing.current = false;
        setBusy(false);
    } }, [access, bookingId, refreshQueue, reload, cleared, scope]);
    useEffect(() => { queueMicrotask(() => void reload()); }, [reload]);
    useEffect(() => { queueMicrotask(() => void refreshQueue()); }, [refreshQueue]);
    useEffect(() => { const update = () => setOffline(!navigator.onLine); queueMicrotask(update); window.addEventListener('online', update); window.addEventListener('offline', update); return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); }; }, []);
    const refresh = useCallback(() => { if (cleared)
        return; void reload(); if (scope && !unavailable)
        void sync(); }, [reload, sync, scope, unavailable, cleared]);
    useVisibleRefresh(refresh);
    const events = useCallback((page: number) => access.events(contextRef.current?.booking.id || bookingId || '', page), [access, bookingId]);
    const photo = useCallback((id: string) => access.photo(id), [access]);
    const trip = context?.trips.find(t => t.id === selected);
    const pending = items.filter(i => i.state !== 'Sent');
    const latestSaved = items.find(i => i.id === lastSavedId);
    const allowed = trip ? actionsFor(trip.operationalStatus) : [];
    const primary = trip && history.available ? nextMilestone(trip, history.events, items.filter(i => i.state !== 'Needs attention').map(i => i.draft)) : null;
    const milestones = allowed.filter(type => type !== primary && type !== 'NOTE' && type !== 'DELAY');
    const reportingClosed = !!context && Date.parse(context.reportingClosesAt) < now;
    function open(type: TimelineEventType, original?: TimelineEvent) { if (!trip)
        return; const now = new Date().toISOString(); setComposer({ clientEventId: crypto.randomUUID(), tripId: trip.id, assignmentVersion: trip.assignmentVersion, type, occurredAt: now, recordedAt: now, submissionMode: offline ? 'OFFLINE_SYNC' : 'ONLINE', ...(original ? { tripId: original.tripId, assignmentVersion: original.assignmentVersion, correctsEventId: original.id } : {}) }); }
    async function save(draft: CreateTimelineEvent, files: Blob[]) { if (saving.current || !context)
        return; saving.current = true; setBusy(true); try {
        const problem = validateEntry(draft, context.booking.startsAt, files.length);
        if (problem)
            throw new Error(problem);
        if (!context.trips.some(t => t.id === draft.tripId && t.assignmentVersion === draft.assignmentVersion))
            throw new Error('The assignment changed. Refresh and reopen the action.');
        const saved = await withTimelineLock(async () => { const item = newQueueItem(scope, context.booking.id, { ...draft, submissionMode: items.find(i => i.id === draft.clientEventId)?.draft.submissionMode || (!navigator.onLine ? 'OFFLINE_SYNC' : 'ONLINE') }, files); const entries = await timelineStore.list(); const persisted = entries.find(i => i.id === draft.clientEventId); if (entries.filter(i => i.state !== 'Sent' && i.id !== draft.clientEventId).length >= 100 || entries.filter(i => i.state !== 'Sent' && i.id !== draft.clientEventId).reduce((sum, i) => sum + i.photos.reduce((n, p) => n + p.blob.size, 0), 0) + files.reduce((n, f) => n + f.size, 0) > 100 * 1024 * 1024)
            throw new Error('Device queue is full. Sync or discard saved entries before adding more.'); const old = items.find(i => i.id === draft.clientEventId); if (persisted?.envelope)
            throw new Error('Resolve the existing submission before editing.'); if (old)
            item.photos = files.map(blob => old.photos.find(p => p.blob === blob) || { blob }); await timelineStore.put(item); for (const oldSent of entries.filter(i => i.state === 'Sent').slice(0, -20))
            await timelineStore.remove(oldSent.id); return true; });
        if (!saved)
            throw new Error('Another tab is syncing. Try saving again in a moment.');
        setLastSavedId(draft.clientEventId);
        setComposer(null);
        await refreshQueue();
        if (!offline)
            await sync();
    }
    catch (e) {
        setError(timelineError(e));
        throw e;
    }
    finally {
        saving.current = false;
        setBusy(false);
    } }
    if (cleared)
        return <main className="page"><h1>Booking access cleared</h1><p>Saved updates remain on this device. Reopen a valid booking link to review them.</p></main>;
    return <main className="page timeline-driver">
        {access.method === 'LOGIN' && <Link className="text-link feedback-back" href="/driver/bookings">← Back to trip updates</Link>}
        <div className="page-header"><div><p className="eyebrow">Trip updates</p><h1>{context?.booking.bookingReference || 'Trip updates'}</h1>{context && <p>{context.booking.passengerName} · {formatTripRange(context.booking.startsAt, context.booking.endsAt)}</p>}</div></div>
        {offline && <p className="alert" role="status">You’re offline. Save updates here and keep this page open to send them when connected.</p>}
        {error && <p className="alert" role="alert">{error}</p>}
        {latestSaved && <p className={`alert ${latestSaved.state === 'Sent' ? 'timeline-success' : ''}`} role="status">{latestSaved.state === 'Sent' ? 'Update sent.' : latestSaved.state === 'Sending' ? 'Sending your update…' : latestSaved.state === 'Needs attention' || latestSaved.state === 'Upload failed' ? 'Update saved on this device. Review it below to finish sending.' : 'Update saved on this device. It will send when connected while this page is open.'}</p>}
        {unavailable ? <section className="card card-pad"><h2>Access unavailable</h2><p>Ask your admin for current access. Unsent work is retained here.</p>{access.method === 'LOGIN' && <Link href="/driver/login">Sign in again</Link>}</section> : !context ? <p aria-live="polite">Loading booking…</p> : <>
            {context.trips.length > 1 && <div className="field"><label htmlFor="current-trip">Trip to update</label><select className="select" id="current-trip" value={selected} onChange={e => { setSelected(e.target.value); setComposer(null); }}>{context.trips.map(t => <option key={t.id} value={t.id}>{t.pickupLocation} → {t.destination} · {formatDateTime(t.scheduledAt)} · {progressLabels[t.operationalStatus]}</option>)}</select></div>}
            {!trip ? <p>No currently authorised trips.</p> : <article className="card card-pad driver-current-trip">
                <div className="driver-trip-heading"><h2>{trip.pickupLocation} → {trip.destination}</h2><span className="status">{progressLabels[trip.operationalStatus]}</span></div>
                <p>{formatTripRange(trip.scheduledAt, trip.scheduledEndAt)}</p><p className="timeline-meta">{trip.vehicle.displayName} · {trip.vehicle.registrationNumber}</p>
                {reportingClosed ? <p className="alert">Reporting has closed. Ask your admin to extend access.</p> : <>
                    {primary && <p className="field-label driver-next-label">Next step</p>}{primary && <button className="button driver-primary-action" disabled={busy} onClick={() => open(primary)}>{eventLabels[primary]}</button>}
                    {!!milestones.length && <div className="driver-milestones"><p className="field-label">Other milestones</p><div className="timeline-actions">{milestones.map(type => <button className="button button-secondary" disabled={busy} key={type} onClick={() => open(type)}>{eventLabels[type]}</button>)}</div></div>}
                    <div className="driver-extra-updates"><p className="field-label">Add to your update (optional)</p><div className="timeline-actions">
                        <button className="button button-secondary" disabled={busy} onClick={() => open('NOTE')}>Add note</button>
                        <button className="button button-secondary" disabled={busy} onClick={() => open('NOTE')}>Add photos</button>
                        {allowed.includes('DELAY') && <button className="button button-secondary" disabled={busy} onClick={() => open('DELAY')}>Report delay</button>}
                    </div></div>
                </>}
            </article>}
        </>}
        {!!pending.length && <section className="driver-pending" aria-label="Saved updates">
            <details key={unavailable || pending.some(i => i.state === 'Needs attention' || i.state === 'Upload failed') ? 'attention' : 'waiting'} className="driver-disclosure card card-pad" open={unavailable || pending.some(i => i.state === 'Needs attention' || i.state === 'Upload failed')}>
                <summary>{pending.length} {pending.length === 1 ? 'update' : 'updates'} waiting to send</summary>
                <p>Saved on this device. Keep this page open to send updates; they appear in the timeline once received. Clearing browser storage removes unsent work.</p>
                {pending.some(i => i.state === 'Queued' || i.state === 'Upload failed') && <button className="button button-secondary" onClick={() => void sync(true)} disabled={busy || offline}>Retry saved updates</button>}
                {pending.map(item => <article className="driver-saved-update" key={item.id}>
                    <strong>{eventLabels[item.draft.type]} · {item.state}</strong><p className="timeline-meta">{context?.trips.find(t => t.id === item.draft.tripId) && `${context.trips.find(t => t.id === item.draft.tripId)?.pickupLocation} → ${context.trips.find(t => t.id === item.draft.tripId)?.destination} · `}{formatDateTime(item.draft.occurredAt)}</p><p className="timeline-note">{item.draft.note}</p>{item.problem && <p role="alert">{item.problem}</p>}
                    <button className="button button-secondary" disabled={busy || offline || item.state === 'Sending'} onClick={async () => { await retryTimelineItem(item.id); await sync(); }}>Retry this update</button>
                    <details className="driver-disclosure"><summary>Saved update options</summary><div className="timeline-actions">
                        <button className="button button-secondary" onClick={() => { const url = URL.createObjectURL(new Blob([exportEntry(item)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = 'saved-trip-update.json'; a.click(); URL.revokeObjectURL(url); }}>Export saved update</button>
                        {!item.envelope && <button className="button button-secondary" disabled={busy || unavailable} onClick={() => { if (!context?.trips.some(t => t.id === item.draft.tripId && t.assignmentVersion === item.draft.assignmentVersion)) { setError('The assignment changed. Keep this entry for admin resolution.'); return; } setComposer(item.draft); }}>Edit unsent draft</button>}
                        {!item.envelope && item.photos.map((_, i) => <button className="button button-secondary" key={i} disabled={busy} onClick={async () => { if (!window.confirm('Remove this private photo from the unsent update?')) return; await removeQueuedPhoto(item.id, i); await refreshQueue(); }}>Remove photo {i + 1}</button>)}
                        <button className="button button-danger" disabled={busy} onClick={async () => { if (window.confirm('Discard this unsent update and its photos from this device?')) { await withTimelineLock(() => timelineStore.remove(item.id)); await refreshQueue(); } }}>Discard</button>
                    </div></details>
                </article>)}
            </details>
        </section>}
        {context && <details className="driver-disclosure card card-pad driver-history"><summary>Trip history</summary><TimelineFeed key={scope} loadAll onEvents={receiveHistory} load={events} photo={photo} refreshKey={refreshKey} routes={Object.fromEntries(context.trips.map(t => [t.id, `${t.pickupLocation} → ${t.destination}`]))} onCorrect={e => { if (context.trips.some(t => t.id === e.tripId && t.assignmentVersion === e.assignmentVersion)) open('CORRECTION', e); else setError('This update belongs to an earlier assignment and cannot be corrected here.'); }}/></details>}
        <details className="driver-disclosure driver-page-options"><summary>Booking details &amp; options</summary>
            {context && <><p>Reporting closes {formatDateTime(context.reportingClosesAt)}{context.expiresAt && ` · Link expires ${formatDateTime(context.expiresAt)}`}</p>{trip && <p>Actual start: {trip.startedAt ? formatDateTime(trip.startedAt) : 'Not recorded'} · Actual completion: {trip.completedAt ? formatDateTime(trip.completedAt) : 'Not recorded'}</p>}</>}
            <p className="timeline-meta">{updated && `Booking refreshed ${formatDateTime(updated)}`}</p><div className="timeline-actions"><button className="button button-secondary" onClick={() => void reload()} disabled={busy}>Reload booking</button>
            {access.method === 'LINK' && <button className="button button-secondary" disabled={busy} onClick={() => { if (pending.length && !window.confirm('Unsent updates are saved on this device. Clear this access session and keep them for a future valid link?')) return; try { clearDriverToken(); } catch { /* Session storage may be disabled. */ } setContext(null); setCleared(true); }}>Clear access session</button>}</div>
        </details>
        {composer && context && <Composer draft={composer} startsAt={context.booking.startsAt} initialFiles={items.find(i => i.id === composer.clientEventId)?.photos.map(p => p.blob) || []} route={context.trips.find(t => t.id === composer.tripId)} busy={busy} onSave={save} onClose={() => !busy && setComposer(null)}/>}
    </main>;
}
function Composer({ draft, startsAt, route, busy, onSave, onClose, initialFiles }: {
    draft: CreateTimelineEvent;
    startsAt: string;
    initialFiles: Blob[];
    route?: DriverBookingContext['trips'][number];
    busy: boolean;
    onSave: (draft: CreateTimelineEvent, files: Blob[]) => Promise<void>;
    onClose: () => void;
}) {
    const [note, setNote] = useState(draft.note || ''), [reason, setReason] = useState(draft.correctionReason || ''), [files, setFiles] = useState<Blob[]>(initialFiles), [location, setLocation] = useState<EventLocation | undefined>(draft.location), [recordedAt, setRecordedAt] = useState(draft.recordedAt), [error, setError] = useState(''), [locBusy, setLocBusy] = useState(false), [locMessage, setLocMessage] = useState('');
    async function capture() { setLocBusy(true); setLocMessage(''); try {
        if (!navigator.geolocation)
            throw new Error('Location is unavailable. You can still report this update.');
        const value = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }));
        const capturedAt = new Date().toISOString();
        const result = { latitude: value.coords.latitude, longitude: value.coords.longitude, accuracyMeters: value.coords.accuracy, capturedAt };
        if (!validLocation(result))
            throw new Error('Location was invalid. Continue without it or retry.');
        setLocation(result);
        setRecordedAt(capturedAt);
        setLocMessage(`Location included · reported accuracy ${Math.round(result.accuracyMeters)} m`);
    }
    catch {
        setLocation(undefined);
        setLocMessage('Location could not be captured. You can continue without it.');
    }
    finally {
        setLocBusy(false);
    } }
    async function submit(e: FormEvent) { e.preventDefault(); if (busy || locBusy)
        return; const event = { ...draft, recordedAt, note: note.trim() || undefined, location, ...(draft.type === 'CORRECTION' ? { correctionReason: reason.trim() } : {}) }; const issue = validateEntry(event, startsAt, files.length); if (issue) {
        setError(issue);
        return;
    } try {
        await onSave(event, files);
    }
    catch (e) {
        setError(timelineError(e));
    } }
    const needsContent = ['NOTE', 'DELAY', 'CORRECTION'].includes(draft.type);
    const title = draft.type === 'NOTE' ? 'Add note or photos' : draft.type === 'DELAY' ? 'Report delay' : eventLabels[draft.type];
    const noteField = <div className="field"><label htmlFor="event-note">{draft.type === 'CORRECTION' ? 'Corrected note (optional)' : 'Note (optional)'}</label><textarea className="textarea" id="event-note" maxLength={4000} value={note} onChange={e => setNote(e.target.value)}/></div>;
    return <Modal onDismiss={onClose}><form className="dialog" role="dialog" aria-modal="true" aria-labelledby="composer-title" onSubmit={submit}><h2 id="composer-title" tabIndex={-1}>{title}</h2><p>{route?.pickupLocation} → {route?.destination}</p><p>{formatDateTime(draft.occurredAt)}</p>{draft.type === 'TRIP_COMPLETED' ? <p>Confirm this trip is complete.</p> : !needsContent && <p>Confirm this milestone for the selected trip.</p>}{draft.type === 'CORRECTION' && <div className="field"><label htmlFor="correction-reason">Why are you correcting this update?</label><textarea className="textarea" id="correction-reason" maxLength={1000} required value={reason} onChange={e => setReason(e.target.value)}/></div>}{noteField}<div className="composer-details"><div className="field"><label htmlFor="event-photos">Photos (optional)</label><p className="timeline-meta" id="photo-help">Private · up to 10 JPEG, PNG or WebP photos, 10 MB each.</p><input aria-describedby="photo-help" className="input" id="event-photos" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e => { const selected = Array.from(e.target.files || []); if (selected.length > 10 || selected.some(f => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) || f.size > 10 * 1024 * 1024 || f.size === 0)) {
        setError('Choose up to 10 JPEG, PNG or WebP photos, each between 1 byte and 10 MB.');
        e.target.value = '';
        return;
    } setFiles(selected); setError(''); }}/></div><ul>{files.map((f, i) => <li key={i}>{(f as File).name || `Photo ${i + 1}`} <button type="button" onClick={() => setFiles(old => old.filter((_, n) => n !== i))}>Remove</button></li>)}</ul><details className="driver-disclosure"><summary>Location (optional)</summary><div className="timeline-actions"><button type="button" className="button button-secondary" disabled={locBusy || busy} onClick={() => void capture()}>Include my location</button>{location && <button type="button" className="button button-secondary" onClick={() => { setLocation(undefined); setLocMessage('Location omitted.'); }}>Remove location</button>}</div><p role="status">{locBusy ? 'Capturing location…' : locMessage}</p></details></div>{error && <p className="alert" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button" disabled={busy || locBusy}>{busy ? 'Saving…' : draft.type === 'TRIP_COMPLETED' ? 'Confirm completion' : draft.type === 'TRIP_STARTED' ? 'Confirm start' : needsContent ? 'Save update' : 'Confirm update'}</button></div></form></Modal>;
}
