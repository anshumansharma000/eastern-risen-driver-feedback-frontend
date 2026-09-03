"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import type { DataResponse,Trip } from "@/lib/contracts";
import { apiRequest,errorPresentation,type ApiErrorPresentation } from "@/lib/api";
import { ErrorAlert,LoadingCards } from "./ui";
import { TripCard } from "./trip-card";
export function DriverTripDetail({id}:{id:string}){const [trip,setTrip]=useState<Trip|null>(null);const [error,setError]=useState<ApiErrorPresentation|null>(null);useEffect(()=>{void (async()=>{try{const r=await apiRequest<DataResponse<Trip>>(`/api/v1/driver/trips/${id}`);setTrip(r.data)}catch(cause){setError(errorPresentation(cause))}})()},[id]);return <><div className="page-header"><div><p className="eyebrow">Assigned journey</p><h1>Trip details</h1><p>Check the booking, schedule, vehicle, and route before starting passenger mode.</p></div><Link className="button button-secondary" href="/driver">Back to journeys</Link></div>{error&&<ErrorAlert {...error}/>} {!trip&&!error&&<LoadingCards/>}{trip&&<TripCard trip={trip}/>}</>}
