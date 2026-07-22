"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import type { Paginated, Trip } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import { EmptyState, ErrorAlert, LoadingCards, Unavailable } from "./ui";
import { TripCard } from "./trip-card";

export function DriverHome(){const [trips,setTrips]=useState<Trip[]|null>(null);const [error,setError]=useState<{message:string;requestId?:string}|null>(null);
  async function load(){setError(null);try{const result=await apiRequest<Paginated<Trip>>("/api/v1/driver/trips?status=READY&page=1&pageSize=10");setTrips(result.data);}catch(cause){setError({message:errorMessage(cause),requestId:cause instanceof ApiError?cause.requestId:undefined});setTrips([])}}
  useEffect(()=>{queueMicrotask(()=>void load())},[]);
  return <><div className="page-header"><div><p className="eyebrow">Ready journeys</p><h1>Today’s handoffs</h1><p>Confirm the correct trip before giving the device to a passenger.</p></div><Link className="button" href="/driver/trips/new">Enter trip manually</Link></div>
    <div className="grid-3" style={{marginBottom:"1.5rem"}}><div className="card stat"><span>Ready now</span><strong>{trips?.length??"—"}</strong><small>Assigned to your account</small></div><div className="card stat"><span>Waiting to sync</span><strong>—</strong><small>Stored only on this device</small></div><Unavailable title="Performance coming later">Your aggregate scores will appear when the backend performance endpoint is available.</Unavailable></div>
    {error&&<><ErrorAlert message={error.message} requestId={error.requestId}/><button className="button button-secondary" onClick={load}>Try again</button></>}{trips===null&&!error&&<LoadingCards/>}{trips?.length===0&&!error&&<EmptyState title="No trips are ready">Trips assigned to you and ready for feedback will appear here.</EmptyState>}{trips&&trips.length>0&&<div className="trip-list">{trips.map(t=><TripCard key={t.id} trip={t}/>)}</div>}
  </>}
