"use client";
import type { DriverEngagement } from "@/lib/contracts";
import { listQuery } from "@/lib/pagination";
import { EmptyState, ErrorAlert, LoadingCards } from "./ui";
import { EngagementCard } from "./trip-card";
import { usePaginatedList } from "./pagination";

export function DriverHome(){
  const ready=usePaginatedList<DriverEngagement>(`/api/v1/driver/engagements?${listQuery({status:"READY",page:1,pageSize:100})}`);
  const started=usePaginatedList<DriverEngagement>(`/api/v1/driver/engagements?${listQuery({status:"FEEDBACK_STARTED",page:1,pageSize:100})}`);
  const engagements=ready.items&&started.items?[...ready.items,...started.items].sort((a,b)=>(a.trips[0]?.scheduledAt??"").localeCompare(b.trips[0]?.scheduledAt??"")||a.sequenceNumber-b.sequenceNumber):null;
  const error=ready.error||started.error;const loading=ready.loading||started.loading;const retry=()=>Promise.all([ready.refetch(),started.refetch()]);
  return <><div className="page-header"><div><p className="eyebrow">Driver engagements</p><h1>Today’s handoffs</h1><p>Each card covers one consecutive run of trips with the same driver.</p></div></div><div className="grid-2" style={{marginBottom:"1.5rem"}}><div className="card stat"><span>Ready now</span><strong>{ready.pagination?.total??"—"}</strong><small>Assigned to your account</small></div><div className="card stat"><span>Feedback started</span><strong>{started.pagination?.total??"—"}</strong><small>Waiting for passenger submission</small></div></div>{error&&<><ErrorAlert message={error.message} requestId={error.requestId}/><button className="button button-secondary" onClick={()=>void retry()}>Try again</button></>}{engagements===null&&!error&&<LoadingCards/>}{engagements?.length===0&&!error&&<EmptyState title="No active engagements">Ready engagements and feedback in progress will appear here.</EmptyState>}{engagements&&engagements.length>0&&<div className="trip-list" aria-busy={loading}>{engagements.map(item=><EngagementCard key={item.id} engagement={item}/>)}</div>}</>
}
