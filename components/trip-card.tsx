"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Trip, HandoffTrip } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import { formatTripRange, tripSource, tripStatus } from "@/lib/status";
import { setHandoff } from "@/lib/handoff";
import { ErrorAlert, StatusBadge } from "./ui";
import { Modal } from "./modal";
import { ShareFeedbackLinkAction } from "./share-feedback-link";

export function TripCard({ trip, allowHandoff = true }: { trip: Trip; allowHandoff?: boolean }) {
  const router=useRouter(); const [confirm,setConfirm]=useState(false); const [busy,setBusy]=useState(false); const [error,setError]=useState<{message:string;requestId?:string}|null>(null); const state=tripStatus[trip.status];
  async function start(){setBusy(true);setError(null);try{const response=await apiRequest<{data:HandoffTrip}>(`/api/v1/driver/trips/${trip.id}/start-feedback`,{method:"POST"});setHandoff(response.data.feedbackAccessToken,response.data.feedbackAccessTokenExpiresAt);router.push("/feedback");}catch(cause){setError({message:errorMessage(cause),requestId:cause instanceof ApiError?cause.requestId:undefined});setConfirm(false);}finally{setBusy(false)}}
  return <article className="card trip-card"><div className="trip-card-head"><div><span className="eyebrow">{tripSource[trip.creationSource]}</span><h3>{trip.booking.bookingReference}</h3><span className="trip-meta">{trip.booking.passengerName} · {formatTripRange(trip.scheduledAt,trip.scheduledEndAt)} · {trip.vehicle.displayName} · {trip.vehicle.registrationNumber}</span></div><StatusBadge label={state.label} tone={state.tone}/></div>
    <div className="route"><div className="route-line"><i className="route-dot"/><i className="route-dot"/></div><div className="route-points"><span><small>Pickup</small>{trip.pickupLocation}</span><span><small>Destination</small>{trip.destination}</span></div></div>
    {error&&<ErrorAlert message={error.message} requestId={error.requestId}/>}<div className="trip-actions"><Link className="button button-secondary" href={`/driver/trips/detail?tripId=${encodeURIComponent(trip.id)}`}>View trip</Link>{allowHandoff&&(trip.status==="READY"||trip.status==="FEEDBACK_STARTED")&&<button className="button" onClick={()=>setConfirm(true)}>Start passenger handoff</button>}{allowHandoff&&(trip.status==="READY"||trip.status==="FEEDBACK_STARTED")&&<ShareFeedbackLinkAction tripId={trip.id} audience="driver"/>}</div>
    {confirm&&<Modal onDismiss={()=>setConfirm(false)}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby={`handoff-${trip.id}`}><span className="eyebrow">Passenger-safe mode</span><h2 id={`handoff-${trip.id}`}>Hand over the device?</h2><p>This will replace the driver workspace with a private feedback flow. Confirm the route before passing the device to the passenger.</p><div className="route"><div className="route-line"><i className="route-dot"/><i className="route-dot"/></div><div className="route-points"><span><small>Pickup</small>{trip.pickupLocation}</span><span><small>Destination</small>{trip.destination}</span></div></div><div className="dialog-actions"><button className="button button-secondary" onClick={()=>setConfirm(false)}>Not yet</button><button className="button" disabled={busy} onClick={start}>{busy?"Preparing…":"Begin handoff"}</button></div></section></Modal>}
  </article>
}
