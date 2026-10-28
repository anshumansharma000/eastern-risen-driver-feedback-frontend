"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { adminTimeline } from "@/lib/timeline-api";
import type { BookingDetail } from "@/lib/contracts";
import type { IssuedDriverLink, OperationalStatus, TripOverviewRow } from "@/lib/timeline-types";
import { historyLabels, progressLabels, timelineError, validateExpiry } from "@/lib/timeline-rules";
import { formatDateTime, formatTripRange } from "@/lib/timeline-time";
import { invalidateTripMutationData, DATA_INVALIDATED_EVENT } from "@/lib/data-invalidation";
import { TimelineFeed, useVisibleRefresh } from "./timeline-feed";
import { Modal } from "./modal";
import { AlertDialog } from "./alert-dialog";
import { StatusBadge } from "./ui";

function ProgressBadge({status}:{status:OperationalStatus}) {
  return <StatusBadge label={progressLabels[status]} tone={status === "COMPLETED" ? "success" : status === "IN_PROGRESS" ? "warning" : "neutral"}/>;
}

export function AdminOperationalOverview({bookingId,active=true,compact=false,enabled=true}:{bookingId?:string;active?:boolean;compact?:boolean;enabled?:boolean}) {
  const [rows,setRows]=useState<TripOverviewRow[]>([]);
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(true);
  const [updated,setUpdated]=useState("");
  const [override,setOverride]=useState<TripOverviewRow|null>(null);
  const [message,setMessage]=useState("");
  const requestVersion=useRef(0);
  const pageSize=compact?5:25;
  const load=useCallback(async()=>{
    const version=++requestVersion.current;
    setBusy(true);
    try {
      const result=await adminTimeline.trips(page,bookingId,pageSize);
      if(version!==requestVersion.current)return;
      setRows(result.data);setTotal(result.pagination.total);setError("");setUpdated(new Date().toISOString());
    } catch(error) {
      if(version!==requestVersion.current)return;
      setError(timelineError(error));
      if(error instanceof ApiError&&(error.status===401||error.status===403)){setRows([]);setTotal(0)}
    } finally {if(version===requestVersion.current)setBusy(false)}
  },[bookingId,page,pageSize]);
  const invalidatePendingRequests=useCallback(()=>{requestVersion.current++},[]);
  useEffect(()=>{
    if(!enabled)return;
    queueMicrotask(()=>void load());
    window.addEventListener(DATA_INVALIDATED_EVENT,load);
    return()=>{invalidatePendingRequests();window.removeEventListener(DATA_INVALIDATED_EVENT,load)};
  },[load,enabled,invalidatePendingRequests]);
  useVisibleRefresh(load,30000,enabled);
  const timelineHref=(id:string)=>`/admin/bookings/detail?bookingId=${encodeURIComponent(id)}#booking-timeline`;
  return <section className={`timeline-section ${compact?"progress-snapshot":""}`} aria-label={compact?"Booking progress summary":"Booking trip progress"}>
    <div className="section-heading">
      <div><p className="eyebrow">Booking operations</p><h2 className="section-title">{compact?"Booking progress":"Trip progress"}</h2></div>
      <button className="button button-secondary" disabled={busy} onClick={()=>void load()}>{busy&&updated?"Refreshing…":"Refresh progress"}</button>
    </div>
    <p className="timeline-meta">{compact?"Open a booking to review its timeline and manage driver access.":"Review progress for each trip. Booking closure remains a separate action."}</p>
    {message&&<p className="alert timeline-success" role="status">{message}</p>}
    {error&&<p className="alert" role="alert">{error}{rows.length>0&&" Previously loaded progress is shown below."}</p>}
    {busy&&!updated&&<p role="status">Loading trip progress…</p>}
    {!busy&&!error&&!rows.length&&<div className="card card-pad"><p>No trips to show.</p>{compact&&<Link className="text-link" href="/admin/bookings">Open bookings →</Link>}</div>}
    {compact?<div className="card progress-rows" aria-busy={busy}>
      {rows.map(row=><article className="progress-row" key={row.tripId}>
        <div><Link className="text-link" href={timelineHref(row.bookingId)}>{row.bookingReference}</Link><strong>{row.pickupLocation} → {row.destination}</strong><small>{row.driverName} · {formatDateTime(row.scheduledAt)}</small></div>
        <div className="progress-row-state"><ProgressBadge status={row.operationalStatus}/>{row.readyToClose&&<small>Ready to close</small>}</div>
        <div className="progress-row-update">{row.latestUpdate?<><span>{historyLabels[row.latestUpdate.type]}</span><small>Received {formatDateTime(row.latestUpdate.receivedAt)}</small></>:<span>No updates received</span>}</div>
        <Link className="text-link progress-row-open" href={timelineHref(row.bookingId)} aria-label={`Open timeline for ${row.bookingReference}: ${row.pickupLocation} to ${row.destination}`}>Timeline →</Link>
      </article>)}
    </div>:<div className="trip-list" aria-busy={busy}>
      {rows.map(row=><article className="card card-pad progress-trip" key={row.tripId}>
        <header><div><h3>{row.pickupLocation} → {row.destination}</h3><p>{row.driverName}</p></div><ProgressBadge status={row.operationalStatus}/></header>
        <p className="timeline-meta">Scheduled · {formatTripRange(row.scheduledAt,row.scheduledEndAt)}</p>
        <dl className="progress-times"><div><dt>Actual start</dt><dd>{row.startedAt?formatDateTime(row.startedAt):"Not recorded"}</dd></div><div><dt>Actual completion</dt><dd>{row.completedAt?formatDateTime(row.completedAt):"Not recorded"}</dd></div></dl>
        <p className="progress-latest">{row.latestUpdate?<><strong>Latest received · {historyLabels[row.latestUpdate.type]}</strong><span>{row.latestUpdate.driverName} · occurred {formatDateTime(row.latestUpdate.occurredAt)}</span><small>Received {formatDateTime(row.latestUpdate.receivedAt)}</small></>:"No updates received."}</p>
        {row.readyToClose&&<p className="status status-success">All active trips completed/cancelled—ready to close</p>}
        {active&&row.bookingStatus==="ACTIVE"&&<div className="timeline-actions"><button className="button button-secondary" onClick={()=>setOverride(row)}>Correct / reopen progress</button></div>}
      </article>)}
    </div>}
    <footer className="progress-footer"><small className="timeline-meta">{updated?`Updated ${formatDateTime(updated)}`:""}{total>0&&` · Showing ${(page-1)*pageSize+1}–${(page-1)*pageSize+rows.length} of ${total} trips`}</small>
      {total>pageSize&&<div className="pagination-actions"><button className="button button-secondary" disabled={page===1||busy} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button className="button button-secondary" disabled={page*pageSize>=total||busy} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
    </footer>
    {override&&<ProgressOverride row={override} onClose={()=>setOverride(null)} onSaved={()=>{setOverride(null);setMessage("Progress updated. Refresh the driver’s booking link so they receive current trip access.");void load()}}/>}
  </section>;
}

export function AdminBookingTimeline({booking,enabled=true}:{booking:BookingDetail;enabled?:boolean}) {
  const [refreshKey,setRefreshKey]=useState(0);
  const events=useCallback((page:number)=>adminTimeline.events(booking.id,page),[booking.id]);
  useEffect(()=>{const refresh=()=>setRefreshKey(k=>k+1);window.addEventListener(DATA_INVALIDATED_EVENT,refresh);return()=>window.removeEventListener(DATA_INVALIDATED_EVENT,refresh)},[]);
  const drivers=[...new Map(booking.engagements.filter(e=>!e.archivedAt&&e.trips.some(t=>!t.archivedAt&&t.status!=="ARCHIVED")).map(e=>[e.driver.id,e.driver])).values()];
  const routes=Object.fromEntries(booking.engagements.flatMap(e=>e.trips.map(t=>[t.id,`${t.pickupLocation} → ${t.destination}`])));
  return <section className="booking-updates">
    <AdminOperationalOverview bookingId={booking.id} active={booking.status==="ACTIVE"} enabled={enabled}/>
    <div className="booking-updates-grid">
      <TimelineFeed key={booking.id} load={events} photo={adminTimeline.photo} refreshKey={refreshKey} routes={routes} active={enabled}/>
      <aside className="driver-access-section" aria-label="Driver booking access"><p className="eyebrow">Driver access</p><h2 className="section-title">Driver booking links</h2><p className="timeline-meta">Share access to this booking’s assigned trips. Refresh links after an assignment changes or a trip is reopened.</p>
        {!drivers.length&&<p>No currently assigned drivers.</p>}
        {drivers.map(driver=><DriverLinkControls key={driver.id} bookingId={booking.id} driverId={driver.id} name={driver.displayName} endsAt={booking.endsAt} active={booking.status==="ACTIVE"||booking.status==="COMPLETED"}/>)}
      </aside>
    </div>
  </section>;
}

function DriverLinkControls({bookingId,driverId,name,endsAt,active}:{bookingId:string;driverId:string;name:string;endsAt:string;active:boolean}) {
  const [link,setLink]=useState<IssuedDriverLink|null>(null);
  const [expiry,setExpiry]=useState("");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState(false);
  const [advanced,setAdvanced]=useState(false);
  const [confirmation,setConfirmation]=useState<"regenerate"|"revoke"|null>(null);
  async function issue(regenerate=false,extend=false) {
    if(busy)return;
    const date=expiry?new Date(expiry):null;
    if(date&&Number.isNaN(date.getTime())){setConfirmation(null);setError("Choose a valid expiry date.");return}
    const iso=date?.toISOString();
    if((extend||Date.parse(endsAt)+86400000<=Date.now())&&!iso){setConfirmation(null);setAdvanced(true);setError("Choose a future expiry below before creating or extending access.");return}
    if(iso&&!validateExpiry(iso,endsAt)){setConfirmation(null);setAdvanced(true);setError("Choose a future expiry within 30 days after the later of booking end or now.");return}
    setBusy(true);setError("");setMessage("");
    try {setLink(await adminTimeline.link(bookingId,driverId,{...(iso?{expiresAt:iso}:{}),...(regenerate?{regenerate:true}:{})}));setConfirmation(null);setMessage("Access is ready. Copy the link to share it manually.")}
    catch(error){setConfirmation(null);setError(timelineError(error))}
    finally{setBusy(false)}
  }
  async function revoke() {
    if(busy)return;
    setBusy(true);setError("");setMessage("");
    try {await adminTimeline.revoke(bookingId,driverId);setLink(null);setMessage("Booking link access revoked.")}
    catch(error){setError(timelineError(error))}
    finally{setBusy(false);setConfirmation(null)}
  }
  return <article className="card card-pad driver-link-card">
    <h3>{name}</h3>
    {link&&<p className="timeline-meta">Expires {formatDateTime(link.expiresAt)}</p>}
    <div className="timeline-actions"><button className={link?"button button-secondary":"button"} disabled={busy||!active} onClick={()=>void issue()}>{busy?"Working…":"Issue / refresh access"}</button>
      {link&&<button className="button" onClick={async()=>{try{await navigator.clipboard.writeText(link.link);setMessage("Driver booking link copied.")}catch{setError("Clipboard is unavailable. Open the link below to copy it.")}}}>Copy driver booking link</button>}
    </div>
    {link&&<details className="access-options"><summary>Show link for manual copying</summary><input className="input" readOnly aria-label={`${name} driver booking link`} value={link.link} onFocus={event=>event.target.select()}/></details>}
    <details className="access-options" open={advanced} onToggle={event=>setAdvanced(event.currentTarget.open)}><summary>Access options</summary>
      <div className="field"><label htmlFor={`expiry-${driverId}`}>Link expiry (optional, your device timezone)</label><input className="input" id={`expiry-${driverId}`} type="datetime-local" value={expiry} onChange={event=>setExpiry(event.target.value)}/></div>
      <div className="timeline-actions"><button className="button button-secondary" disabled={busy||!active} onClick={()=>void issue(false,true)}>Extend expiry</button><button className="button button-secondary" disabled={busy||!active} onClick={()=>setConfirmation("regenerate")}>Regenerate</button><button className="button button-danger" disabled={busy} onClick={()=>setConfirmation("revoke")}>Revoke</button></div>
    </details>
    {message&&<p className="share-link-status" role="status">{message}</p>}{error&&<p className="alert" role="alert">{error}</p>}
    {confirmation&&<AlertDialog title={confirmation==="regenerate"?`Regenerate ${name}’s booking link?`:`Revoke ${name}’s booking link?`} confirmLabel={confirmation==="regenerate"?"Regenerate link":"Revoke link"} destructive busy={busy} onCancel={()=>setConfirmation(null)} onConfirm={()=>confirmation==="regenerate"?void issue(true):void revoke()}>
      <p>{confirmation==="regenerate"?"Previous links will stop working. Copy and share the replacement link after regenerating.":"Link access will stop. The driver can still use login access for trips assigned to them."}</p>
    </AlertDialog>}
  </article>;
}
function ProgressOverride({ row, onClose, onSaved }: {
    row: TripOverviewRow;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [status, setStatus] = useState<Exclude<OperationalStatus, 'UNKNOWN'>>('SCHEDULED'), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    async function submit(e: FormEvent) { e.preventDefault(); if (busy || !reason.trim() || !confirmed)
        return; setBusy(true); try {
        await adminTimeline.progress(row.tripId, status, reason.trim());
        invalidateTripMutationData([row.bookingId]);
        onSaved();
    }
    catch (e) {
        setError(timelineError(e));
    }
    finally {
        setBusy(false);
    } }
    return <Modal onDismiss={() => !busy && onClose()}><form className="dialog" role="dialog" aria-modal="true" aria-labelledby="override-title" onSubmit={submit}><h2 id="override-title">Correct / reopen trip progress</h2><p>{row.bookingReference} · {row.pickupLocation} → {row.destination}</p><p>Current progress: {progressLabels[row.operationalStatus]}</p><div className="field"><label htmlFor="requested-progress">Requested progress</label><select className="select" id="requested-progress" value={status} onChange={e => setStatus(e.target.value as typeof status)}>{(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const).map(s => <option key={s} value={s}>{progressLabels[s]}</option>)}</select></div><div className="field"><label htmlFor="progress-reason">Required reason</label><textarea className="textarea" id="progress-reason" maxLength={1000} required value={reason} onChange={e => setReason(e.target.value)}/></div><label className="check-row"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/><span>I understand this starts a new operational cycle, resets actual timing and invalidates old queued assignments and link grants. Recorded history is preserved.</span></label><p>Refresh the driver’s booking link after saving. The reason is stored in backend audit history.</p>{error && <p className="alert" role="alert">{error}</p>}<div className="dialog-actions"><button type="button" className="button button-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button" disabled={busy || !reason.trim() || !confirmed}>{busy ? 'Updating…' : 'Confirm progress change'}</button></div></form></Modal>;
}
