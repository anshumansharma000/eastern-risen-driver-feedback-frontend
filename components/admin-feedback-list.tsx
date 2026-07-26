"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AdminFeedbackSummary, FeedbackListMeta, PaginatedResponse, QuestionCategory } from "@/lib/contracts";
import { ApiError, apiRequest, errorMessage } from "@/lib/api";
import { adminFeedbackPath, categoryLabel, formatInTimezone, scoreLabel, validMonth } from "@/lib/feedback-contract";
import { totalPages } from "@/lib/pagination";
import { PaginationControl, useListSearchParams } from "./pagination";
import { EmptyState, ErrorAlert, LoadingCards, StatusBadge } from "./ui";

const categories:QuestionCategory[]=["OVERALL_EXPERIENCE","DRIVING_SAFETY","PUNCTUALITY","CLEANLINESS","PROFESSIONALISM","VEHICLE_CONDITION","CUSTOM"];
type Response=PaginatedResponse<AdminFeedbackSummary>&{meta:FeedbackListMeta};

export function AdminFeedbackList(){
  const search=useListSearchParams(25); const router=useRouter(); const [response,setResponse]=useState<Response|null>(null); const [loading,setLoading]=useState(false); const [error,setError]=useState<ApiError|null>(null);
  const filters=useMemo(()=>{const p=search.parameters;return {month:validMonth(p.get("month"))?p.get("month")!:undefined,driverId:p.get("driverId")||undefined,driverSource:(p.get("driverSource")||undefined) as "AGENCY"|"OUTSOURCED"|undefined,vendorId:p.get("vendorId")||undefined,reviewState:(p.get("reviewState")||undefined) as "NORMAL"|"FLAGGED"|"ARCHIVED"|undefined,submissionMode:(p.get("submissionMode")||undefined) as "ONLINE"|"OFFLINE_SYNC"|undefined,category:(p.get("category")||undefined) as QuestionCategory|undefined,minimumScore:p.get("minimumScore")?Number(p.get("minimumScore")):undefined,maximumScore:p.get("maximumScore")?Number(p.get("maximumScore")):undefined,negativeOnly:p.get("negativeOnly")==="true"?true:undefined,page:search.page,pageSize:search.pageSize}},[search.parameters,search.page,search.pageSize]);
  const path=search.ready?adminFeedbackPath(filters):null;
  const load=useCallback(async()=>{if(!path)return;setLoading(true);setError(null);try{setResponse(await apiRequest<Response>(path))}catch(cause){setError(cause instanceof ApiError?cause:new ApiError(0,"NETWORK_UNAVAILABLE",errorMessage(cause)))}finally{setLoading(false)}},[path]);
  useEffect(()=>{queueMicrotask(()=>void load())},[load]);
  useEffect(()=>{if(response&&search.page>Math.max(1,totalPages(response.pagination.total,response.pagination.pageSize)))search.setPage(Math.max(1,totalPages(response.pagination.total,response.pagination.pageSize)))},[response,search.page]); // eslint-disable-line react-hooks/exhaustive-deps
  const update=(key:string,value:string)=>search.update({[key]:value||null},true);
  const active=Object.entries(filters).some(([key,value])=>!["page","pageSize"].includes(key)&&value!==undefined);
  const thresholdMissing=error?.code==="NEGATIVE_FEEDBACK_THRESHOLD_REQUIRED";
  return <><div className="page-header"><div><p className="eyebrow">Immutable passenger records</p><h1>Feedback review</h1><p>Filter by submission date and operational dimensions. Passenger contact details remain confined to the protected detail page.</p></div><button className="button button-secondary" disabled={loading} onClick={()=>void load()}>Refresh</button></div>
    <section className="card card-pad feedback-filters" aria-label="Feedback filters">
      <label className="field"><span>Submission month</span><input className="input" type="month" value={filters.month||""} onChange={e=>update("month",e.target.value)}/></label>
      <Filter label="Driver source" value={filters.driverSource||""} onChange={v=>update("driverSource",v)} options={[["AGENCY","Agency"],["OUTSOURCED","Outsourced"]]}/>
      <label className="field"><span>Driver ID</span><input className="input" value={filters.driverId||""} onChange={e=>update("driverId",e.target.value)} placeholder="UUID"/></label>
      <label className="field"><span>Vendor ID</span><input className="input" value={filters.vendorId||""} onChange={e=>update("vendorId",e.target.value)} placeholder="UUID"/></label>
      <Filter label="Review state" value={filters.reviewState||""} onChange={v=>update("reviewState",v)} options={[["NORMAL","Normal"],["FLAGGED","Flagged"],["ARCHIVED","Archived"]]}/>
      <Filter label="Submission mode" value={filters.submissionMode||""} onChange={v=>update("submissionMode",v)} options={[["ONLINE","Online"],["OFFLINE_SYNC","Offline sync"]]}/>
      <Filter label="Category" value={filters.category||""} onChange={v=>update("category",v)} options={categories.map(value=>[value,categoryLabel(value)])}/>
      <label className="field"><span>Minimum score</span><input className="input" type="number" min="1" max="5" step=".1" value={filters.minimumScore??""} onChange={e=>update("minimumScore",e.target.value)}/></label>
      <label className="field"><span>Maximum score</span><input className="input" type="number" min="1" max="5" step=".1" value={filters.maximumScore??""} onChange={e=>update("maximumScore",e.target.value)}/></label>
      <label className="check-row"><input type="checkbox" checked={!!filters.negativeOnly} onChange={e=>search.update({negativeOnly:e.target.checked?"true":null},true)}/><span>Negative feedback only</span></label>
      {active&&<button className="button button-secondary" onClick={()=>{window.history.pushState(null,"",window.location.pathname);window.dispatchEvent(new PopStateEvent("popstate"))}}>Clear filters</button>}
    </section>
    {thresholdMissing&&<div className="alert alert-warning" role="alert"><strong>Negative threshold not configured.</strong><div>Keep this filter active and <Link className="text-link" href="/admin/settings">configure a threshold in settings</Link>.</div></div>}
    {error&&!thresholdMissing&&<><ErrorAlert message={errorMessage(error)} requestId={error.requestId}/>{error.status!==403&&<button className="button button-secondary" onClick={()=>void load()}>Try again</button>}</>}
    {!response&&!error&&<LoadingCards/>}
    {response?.data.length===0&&!error&&<EmptyState title={active?"No feedback matches these filters":"No feedback yet"}>{active?"Adjust one or more filters.":"Submitted passenger feedback will appear here."}</EmptyState>}
    {response&&response.data.length>0&&<><p className="trip-meta feedback-date-basis">Times use {response.meta.timezone}; month filters use submission date.</p><div className="feedback-table-wrap"><table className="feedback-table"><thead><tr><th>Booking / respondent</th><th>Driver</th><th>Submitted</th><th>Mode</th><th>Review</th><th>Score</th></tr></thead><tbody>{response.data.map(item=>{const detailPath=`/admin/feedback/detail?feedbackId=${encodeURIComponent(item.id)}`;return <tr key={item.id} tabIndex={0} onClick={()=>router.push(detailPath)} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();router.push(detailPath)}}}><td><strong>{item.bookingReference}</strong><small>{item.respondentName}</small></td><td><strong>{item.driver.displayName}</strong><small>{item.driver.sourceType==="AGENCY"?"Agency":`Outsourced · ${item.driver.vendorName||"Vendor unavailable"}`}</small></td><td>{formatInTimezone(item.submittedAt,response.meta.timezone)}</td><td><StatusBadge label={item.submissionMode==="OFFLINE_SYNC"?"Offline sync":"Online"} tone={item.submissionMode==="OFFLINE_SYNC"?"warning":"neutral"}/></td><td><ReviewBadge state={item.reviewState}/></td><td>{scoreLabel(item.overallScore)}</td></tr>})}</tbody></table></div><div className="feedback-cards">{response.data.map(item=>{const detailPath=`/admin/feedback/detail?feedbackId=${encodeURIComponent(item.id)}`;return <button className="card feedback-card" key={item.id} onClick={()=>router.push(detailPath)}><span><strong>{item.bookingReference}</strong><small>{item.respondentName}</small></span><span>{item.driver.displayName}<small>{item.driver.sourceType==="OUTSOURCED"?item.driver.vendorName:"Agency driver"}</small></span><span>{formatInTimezone(item.submittedAt,response.meta.timezone)}</span><span className="trip-actions"><ReviewBadge state={item.reviewState}/><StatusBadge label={item.submissionMode==="OFFLINE_SYNC"?"Offline sync":"Online"}/></span><strong>{scoreLabel(item.overallScore)}</strong></button>})}</div></>}
    {response&&<PaginationControl {...response.pagination} page={search.page} loading={loading} onPageChange={page=>search.setPage(page,totalPages(response.pagination.total,response.pagination.pageSize))} onPageSizeChange={search.setPageSize}/>}
  </>;
}
function Filter({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:string[][]}){return <label className="field"><span>{label}</span><select className="select" value={value} onChange={e=>onChange(e.target.value)}><option value="">All</option>{options.map(([key,text])=><option key={key} value={key}>{text}</option>)}</select></label>}
function ReviewBadge({state}:{state:"NORMAL"|"FLAGGED"|"ARCHIVED"}){return <StatusBadge label={state==="NORMAL"?"Normal":state==="FLAGGED"?"Flagged":"Archived"} tone={state==="NORMAL"?"success":state==="FLAGGED"?"warning":"neutral"}/>}
