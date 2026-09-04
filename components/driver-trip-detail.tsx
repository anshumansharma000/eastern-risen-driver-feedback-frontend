"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import type { DataResponse,DriverEngagement } from "@/lib/contracts";
import { apiRequest,errorPresentation,type ApiErrorPresentation } from "@/lib/api";
import { ErrorAlert,LoadingCards } from "./ui";
import { EngagementCard } from "./trip-card";
export function DriverEngagementDetail({id}:{id:string}){const[engagement,setEngagement]=useState<DriverEngagement|null>(null);const[error,setError]=useState<ApiErrorPresentation|null>(null);useEffect(()=>{void(async()=>{try{const r=await apiRequest<DataResponse<DriverEngagement>>(`/api/v1/driver/engagements/${encodeURIComponent(id)}`);setEngagement(r.data)}catch(cause){setError(errorPresentation(cause))}})()},[id]);return <><div className="page-header"><div><p className="eyebrow">Assigned engagement</p><h1>Engagement details</h1><p>Check every covered trip before starting passenger mode.</p></div><Link className="button button-secondary" href="/driver">Back to engagements</Link></div>{error&&<ErrorAlert {...error}/>} {!engagement&&!error&&<LoadingCards/>}{engagement&&<EngagementCard engagement={engagement}/>}</>}
