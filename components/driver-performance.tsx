"use client";

import { useCallback, useEffect, useState } from "react";
import type { DriverPerformance, ScoreSummary } from "@/lib/contracts";
import { ApiError, errorMessage, getData } from "@/lib/api";
import { categoryLabel, countLabel, driverPerformancePath, scoreLabel, validMonth } from "@/lib/feedback-contract";
import { useListSearchParams } from "./pagination";
import { EmptyState, ErrorAlert, LoadingCards } from "./ui";

export function DriverPerformanceView(){
  const search=useListSearchParams();const month=validMonth(search.parameters.get("month"))?search.parameters.get("month")!:undefined;
  const [data,setData]=useState<DriverPerformance|null>(null);const [loading,setLoading]=useState(false);const [error,setError]=useState<ApiError|null>(null);
  const load=useCallback(async()=>{if(!search.ready)return;setLoading(true);setError(null);try{setData(await getData<DriverPerformance>(driverPerformancePath(month)))}catch(cause){setError(cause instanceof ApiError?cause:new ApiError(0,"NETWORK_UNAVAILABLE",errorMessage(cause)))}finally{setLoading(false)}},[month,search.ready]);
  useEffect(()=>{queueMicrotask(()=>void load())},[load]);
  return <><div className="page-header"><div><p className="eyebrow">Private aggregates only</p><h1>Performance</h1><p>Your scored feedback in aggregate—never individual responses, comments, or passenger details.</p></div><label className="field performance-month"><span>Submission month</span><input className="input" type="month" value={month||""} onChange={e=>search.update({month:e.target.value||null})}/><small>Clear for all history</small></label></div>
    {loading&&data&&<p className="trip-meta" role="status">Updating performance…</p>}
    {error&&<><ErrorAlert message={errorMessage(error)} requestId={error.requestId}/>{error.status!==403&&<button className="button button-secondary" onClick={()=>void load()}>Try again</button>}</>}
    {!data&&!error&&<LoadingCards/>}
    {data&&<><p className="trip-meta analytics-basis">Submission-date aggregates in {data.meta.timezone} · {data.meta.month||"all history"}.</p><div className="card stat performance-overall"><span>Overall average</span><strong>{scoreLabel(data.overall.averageScore)}</strong><small>{countLabel(data.overall.responseCount,data.overall.answerCount)}{data.overall.responseCount===0?" · No responses were received in this period.":""}</small></div><div className="grid-2 performance-grid"><PerformanceSection title="Category averages" rows={data.categories.map(row=>({key:row.category,label:categoryLabel(row.category),score:row}))} empty="No category feedback is available for this period."/><PerformanceSection title="Monthly trend" rows={data.monthlyTrend.map(row=>({key:row.month,label:row.month,score:row}))} empty="No monthly feedback is available for this selection."/></div></>}
  </>;
}
function PerformanceSection({title,rows,empty}:{title:string;rows:Array<{key:string;label:string;score:ScoreSummary}>;empty:string}){return <section className="card card-pad driver-score-section"><h2 className="section-title">{title}</h2>{rows.length===0?<EmptyState title="No scored feedback">{empty}</EmptyState>:<div className="driver-score-list">{rows.map(row=><div key={row.key} className="driver-score-row"><span><strong>{row.label}</strong><small>{countLabel(row.score.responseCount,row.score.answerCount)}</small></span><strong>{scoreLabel(row.score.averageScore)}</strong><div className="score-track" aria-hidden="true"><i style={{width:`${row.score.averageScore===null?0:Math.max(0,Math.min(100,row.score.averageScore/5*100))}%`}}/></div></div>)}</div>}<table className="score-table sr-table"><caption className="sr-only">{title} data</caption><thead><tr><th>Period or category</th><th>Average</th><th>Responses</th><th>Answers</th></tr></thead><tbody>{rows.map(row=><tr key={row.key}><th>{row.label}</th><td>{scoreLabel(row.score.averageScore)}</td><td>{row.score.responseCount}</td><td>{row.score.answerCount}</td></tr>)}</tbody></table></section>}
