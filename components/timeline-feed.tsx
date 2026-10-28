"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from "@/lib/api";
import type { PaginatedResponse } from '@/lib/contracts';
import type { PrivatePhotoUrl, TimelineEvent } from '@/lib/timeline-types';
import { canonicalEvents, correctedEvent, historyLabels, timelineError } from '@/lib/timeline-rules';
import { formatDateTime } from '@/lib/timeline-time';
import Image from "next/image";
import { Modal } from './modal';
export function useVisibleRefresh(refresh: () => void, interval = 30000, enabled = true) { useEffect(() => { if (!enabled) return; const run = () => { if (document.visibilityState === 'visible')
    refresh(); }; const timer = setInterval(run, interval); window.addEventListener('online', run); window.addEventListener('focus', run); return () => { clearInterval(timer); window.removeEventListener('online', run); window.removeEventListener('focus', run); }; }, [refresh, interval, enabled]); }
export function TimelineFeed({ load, photo, refreshKey = 0, onCorrect, routes = {}, active = true, loadAll = false, onEvents }: {
    load: (page: number) => Promise<PaginatedResponse<TimelineEvent>>;
    photo: (id: string) => Promise<PrivatePhotoUrl>;
    refreshKey?: number;
    active?: boolean;
    loadAll?: boolean;
    onEvents?: (events: TimelineEvent[], available: boolean) => void;
    onCorrect?: (event: TimelineEvent) => void;
    routes?: Record<string, string>;
}) {
    const [events, setEvents] = useState<TimelineEvent[]>([]), [pages, setPages] = useState(1), [total, setTotal] = useState(0), [busy, setBusy] = useState(true), [error, setError] = useState(''), [updated, setUpdated] = useState('');
    const running = useRef(false), generation = useRef(0);
    const refresh = useCallback(async () => { if (running.current)
        return; running.current = true; const gen = generation.current; setBusy(true); try {
        const rows: TimelineEvent[] = [];
        let count = 0;
        let lastPage = pages;
        for (let p = 1; p <= lastPage; p++) {
            const result = await load(p);
            rows.push(...result.data);
            count = result.pagination.total;
            if (loadAll) lastPage = result.data.length ? Math.ceil(count / result.pagination.pageSize) : p;
        }
        if (gen !== generation.current)
            return;
        const ordered = canonicalEvents(rows);
        setEvents(ordered);
        onEvents?.(ordered, true);
        setTotal(count);
        setError('');
        setUpdated(new Date().toISOString());
    }
    catch (e) {
        if (gen === generation.current) {
            setError(timelineError(e));
            if(e instanceof ApiError&&(e.status===401||e.status===403)){setEvents([]);setTotal(0);onEvents?.([],false)}
        }
    }
    finally {
        running.current = false;
        setBusy(false);
    } }, [load, pages, loadAll, onEvents]);
    useEffect(() => { if(active) queueMicrotask(() => void refresh()); }, [refresh, refreshKey, active]);
    useEffect(() => () => { generation.current++; }, []);
    useVisibleRefresh(refresh,30000,active);
    return <section className="timeline-section"><div className="section-heading"><h2 className="section-title">Timeline</h2><button className="button button-secondary" disabled={busy} onClick={() => void refresh()}>Refresh updates</button></div><p>Chronological order · {updated ? `Last refreshed ${formatDateTime(updated)}` : 'Waiting for updates'}{events.length < total ? ' · Corrections may appear on later pages.' : ''}</p>{error && <p className="alert" role="alert">Could not load updates: {error}</p>}{busy && !events.length ? <p aria-live="polite">Loading updates…</p> : !events.length && !error ? <p>No updates yet.</p> : null}<ol className="timeline-list">{events.map(event => { const corrected = correctedEvent(event, events); return <li className="card card-pad" key={event.id}><h3>{historyLabels[event.type]} · {event.driverNameSnapshot}</h3><p>{routes[event.tripId] || 'Trip update'} · {formatDateTime(event.occurredAt)}</p>{corrected.note && <p className="timeline-note">{corrected.note}</p>}{corrected.location && <p>Location: {corrected.location.latitude.toFixed(5)}, {corrected.location.longitude.toFixed(5)} · reported accuracy {Math.round(corrected.location.accuracyMeters)} m</p>}{event.submissionMode === 'OFFLINE_SYNC' && <p>Synced from offline reporting</p>}{event.backdated && <p>Reported later</p>}{corrected.corrections.length > 0 && <details><summary>Corrected · view original and reasons</summary><p>Original: {event.note || 'No note'}{event.location && ` · ${event.location.latitude}, ${event.location.longitude}`}</p>{corrected.corrections.map(c => <p key={c.id}>{c.correctionReason} · received {formatDateTime(c.receivedAt)}</p>)}</details>}<details><summary>Update details</summary><p>Recorded: {formatDateTime(event.recordedAt)}</p><p>Received: {formatDateTime(event.receivedAt)}</p><p>{event.accessMethod === 'LINK' ? 'Driver link (attributed to assigned driver link)' : 'Driver login'}</p>{event.correctionReason && <p>Correction reason: {event.correctionReason}</p>}</details>{event.photos.map(p => <PrivatePhoto key={p.id} id={p.id} load={photo}/>)}{onCorrect && event.type !== 'CORRECTION' && <button className="button button-secondary" onClick={() => onCorrect(event)}>Correct this update</button>}</li>; })}</ol>{events.length < total && <button className="button button-secondary" disabled={busy} onClick={() => setPages(p => p + 1)}>Load more</button>}</section>;
}
function PrivatePhoto({ id, load }: {
    id: string;
    load: (id: string) => Promise<PrivatePhotoUrl>;
}) {
    const [open, setOpen] = useState(false), [url, setUrl] = useState<PrivatePhotoUrl | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    async function show(force = false) { setOpen(true); if (!force && url && Date.parse(url.expiresAt) > Date.now())
        return; setBusy(true); setError(''); try {
        setUrl(await load(id));
    }
    catch (e) {
        setUrl(null);
        setError(timelineError(e));
    }
    finally {
        setBusy(false);
    } }
    return <><button className="button button-secondary" onClick={() => void show()}>View private photo</button>{open && <Modal onDismiss={() => { setOpen(false); setUrl(null); }}><section className="dialog" role="dialog" aria-modal="true" aria-label="Private attachment">{busy ? <p>Loading photo…</p> : url ? <Image unoptimized width={800} height={600} className="timeline-photo" src={url.url} alt="Private trip attachment" referrerPolicy="no-referrer" onError={() => { if (Date.parse(url.expiresAt) <= Date.now())
        void show(true);
    else {
        setUrl(null);
        setError('This photo could not be loaded. Request a fresh preview.');
    } }}/> : null}{error && <p role="alert">{error}</p>}<div className="dialog-actions"><button className="button button-secondary" onClick={() => void show(true)} disabled={busy}>Retry photo</button><button className="button" onClick={() => { setOpen(false); setUrl(null); }}>Close</button></div></section></Modal>}</>;
}
