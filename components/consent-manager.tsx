"use client";

import { FormEvent,useEffect,useState } from "react";
import type { ConsentVersion,DataResponse } from "@/lib/contracts";
import { ApiError,apiRequest,errorMessage } from "@/lib/api";
import { ErrorAlert,LoadingCards,StatusBadge } from "./ui";
import { Modal } from "./modal";
import { AlertDialog } from "./alert-dialog";

export function ConsentManager(){
  const [consent,setConsent]=useState<ConsentVersion|null>(null);
  const [error,setError]=useState<{message:string;requestId?:string}|null>(null);
  const [show,setShow]=useState(false);
  const [busy,setBusy]=useState(false);
  const [pendingContent,setPendingContent]=useState<string|null>(null);

  async function load(){
    try{
      const response=await apiRequest<DataResponse<ConsentVersion>>("/api/v1/admin/consent-versions/active");
      setConsent(response.data);
    }catch(cause){
      setError({message:errorMessage(cause),requestId:cause instanceof ApiError?cause.requestId:undefined});
    }
  }

  useEffect(()=>{queueMicrotask(()=>void load())},[]);

  async function create(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    setPendingContent(String(data.get("content")||""));
  }

  async function activate(){
    if(!pendingContent)return;
    setBusy(true);
    try{
      await apiRequest("/api/v1/admin/consent-versions",{method:"POST",body:JSON.stringify({content:pendingContent})});
      setPendingContent(null);
      setShow(false);
      await load();
    }catch(cause){
      setError({message:errorMessage(cause),requestId:cause instanceof ApiError?cause.requestId:undefined});
    }finally{
      setBusy(false);
    }
  }

  return <>
    <div className="page-header">
      <div>
        <p className="eyebrow">Passenger privacy</p>
        <h1>Consent notice</h1>
        <p>The active notice is shown in full before a passenger can submit feedback. Activated versions are immutable.</p>
      </div>
      <button className="button" onClick={()=>setShow(true)}>Create new version</button>
    </div>
    {error&&<ErrorAlert message={error.message} requestId={error.requestId}/>}
    {!consent&&!error&&<LoadingCards/>}
    {consent&&<section className="card card-pad">
      <div className="trip-card-head">
        <div><span className="eyebrow">Version {consent.version}</span><h2 className="section-title">Active passenger notice</h2></div>
        <StatusBadge label="Active" tone="success"/>
      </div>
      <div className="consent-box" style={{maxHeight:"none"}}>{consent.content}</div>
      <p className="trip-meta">Effective {new Intl.DateTimeFormat("en-IN",{dateStyle:"long"}).format(new Date(consent.effectiveAt))}</p>
    </section>}
    {show&&<Modal onDismiss={()=>{setPendingContent(null);setShow(false)}}>
      <form className="dialog" role="dialog" aria-modal="true" onSubmit={create}>
        <span className="eyebrow">Immutable on activation</span>
        <h2>New consent version</h2>
        <div className="field">
          <label htmlFor="content">Full privacy and consent text</label>
          <textarea className="textarea" id="content" name="content" required minLength={1} maxLength={20000}/>
        </div>
        <div className="alert alert-warning">Activating this text retires the current version. Existing feedback keeps the version each passenger accepted.</div>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={()=>setShow(false)}>Cancel</button>
          <button className="button" disabled={busy}>Review and activate</button>
        </div>
      </form>
    </Modal>}
    {pendingContent!==null&&<AlertDialog title="Activate this consent notice?" confirmLabel="Activate notice" busy={busy} onCancel={()=>setPendingContent(null)} onConfirm={()=>void activate()}><p>The current notice will be retired and this version will become immutable. Existing feedback will retain the version originally accepted.</p></AlertDialog>}
  </>;
}
