"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DriverEngagement, HandoffEngagement } from "@/lib/contracts";
import { apiRequest, errorPresentation, type ApiErrorPresentation } from "@/lib/api";
import { formatTripRange, tripStatus } from "@/lib/status";
import { setHandoff } from "@/lib/handoff";
import { ErrorAlert, StatusBadge } from "./ui";
import { Modal } from "./modal";
import { ShareFeedbackLinkAction, ShareFeedbackOnWhatsAppAction } from "./share-feedback-link";
import { FeedbackPurposeBadges } from "./admin-trips";

export function EngagementCard({engagement,allowHandoff=true}:{engagement:DriverEngagement;allowHandoff?:boolean}){
  const router=useRouter();const[confirm,setConfirm]=useState(false);const[busy,setBusy]=useState(false);const[error,setError]=useState<ApiErrorPresentation|null>(null);const state=tripStatus[engagement.status];
  async function start(){setBusy(true);setError(null);try{const response=await apiRequest<{data:HandoffEngagement}>(`/api/v1/driver/engagements/${encodeURIComponent(engagement.id)}/start-feedback`,{method:"POST"});setHandoff(response.data.feedbackAccessToken,response.data.feedbackAccessTokenExpiresAt);router.push("/feedback")}catch(cause){setError(errorPresentation(cause));setConfirm(false)}finally{setBusy(false)}}
  const shareable=engagement.status==="READY"||engagement.status==="FEEDBACK_STARTED";
  return <article className="card trip-card"><div className="trip-card-head"><div><span className="eyebrow">Engagement {engagement.sequenceNumber}</span><h3>{engagement.booking.bookingReference}</h3><span className="trip-meta">{engagement.booking.passengerName} · {engagement.driver.displayName}{engagement.driver.vendorName?` · ${engagement.driver.vendorName}`:""}</span><FeedbackPurposeBadges purposes={engagement.feedbackPurposes}/></div><StatusBadge label={state.label} tone={state.tone}/></div>
    <ol className="history-list">{[...engagement.trips].sort((a,b)=>a.scheduledAt.localeCompare(b.scheduledAt)).map(trip=><li key={trip.id}><strong>{trip.pickupLocation} → {trip.destination}</strong><small>{formatTripRange(trip.scheduledAt,trip.scheduledEndAt)} · {trip.vehicle.displayName} · {trip.vehicle.registrationNumber}</small></li>)}</ol>
    {error&&<ErrorAlert {...error}/>}<div className="trip-actions"><Link className="button button-secondary" href={`/driver/trips/detail?engagementId=${encodeURIComponent(engagement.id)}`}>View engagement</Link>{allowHandoff&&shareable&&<button className="button" onClick={()=>setConfirm(true)}>Start passenger handoff</button>}{allowHandoff&&shareable&&<ShareFeedbackOnWhatsAppAction engagementId={engagement.id} audience="driver" recipientName={engagement.booking.passengerName}/>} {allowHandoff&&shareable&&<ShareFeedbackLinkAction engagementId={engagement.id} audience="driver"/>}</div>
    {confirm&&<Modal onDismiss={()=>setConfirm(false)}><section className="dialog" role="dialog" aria-modal="true" aria-labelledby={`handoff-${engagement.id}`}><span className="eyebrow">Passenger-safe mode</span><h2 id={`handoff-${engagement.id}`}>Hand over the device?</h2><p>This opens feedback for {engagement.driver.displayName} and all {engagement.trips.length} covered trip{engagement.trips.length===1?"":"s"}.</p><div className="dialog-actions"><button className="button button-secondary" onClick={()=>setConfirm(false)}>Not yet</button><button className="button" disabled={busy} onClick={start}>{busy?"Preparing…":"Begin handoff"}</button></div></section></Modal>}
  </article>
}
