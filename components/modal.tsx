"use client";

import { ReactNode,useEffect,useRef } from "react";

export function Modal({children,onDismiss}:{children:ReactNode;onDismiss:()=>void}){
  const backdropRef=useRef<HTMLDivElement>(null);
  const dismissRef=useRef(onDismiss);
  useEffect(()=>{dismissRef.current=onDismiss},[onDismiss]);

  useEffect(()=>{
    const previouslyFocused=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const focusableSelector='button:not(:disabled), [href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

    function handleKeyDown(event:KeyboardEvent){
      const openBackdrops=Array.from(document.querySelectorAll(".dialog-backdrop"));
      if(openBackdrops.at(-1)!==backdropRef.current)return;
      if(event.key==="Escape"){
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if(event.key!=="Tab")return;
      const focusable=Array.from(backdropRef.current?.querySelectorAll<HTMLElement>(focusableSelector)??[]);
      if(!focusable.length){
        event.preventDefault();
        return;
      }
      const first=focusable[0];
      const last=focusable[focusable.length-1];
      if(event.shiftKey&&document.activeElement===first){
        event.preventDefault();
        last.focus();
      }else if(!event.shiftKey&&document.activeElement===last){
        event.preventDefault();
        first.focus();
      }
    }

    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow="hidden";
    document.addEventListener("keydown",handleKeyDown);
    const frame=requestAnimationFrame(()=>{
      const initial=backdropRef.current?.querySelector<HTMLElement>('[autofocus], [tabindex="-1"], input:not([type="hidden"]), select, textarea, button');
      initial?.focus();
    });

    return ()=>{
      cancelAnimationFrame(frame);
      document.body.style.overflow=previousOverflow;
      document.removeEventListener("keydown",handleKeyDown);
      previouslyFocused?.focus();
    };
  },[]);

  return <div ref={backdropRef} className="dialog-backdrop" role="presentation" onMouseDown={event=>{
    if(event.currentTarget===event.target)onDismiss();
  }}>{children}</div>;
}
