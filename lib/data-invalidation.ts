export const DATA_INVALIDATED_EVENT="app-data-invalidated";

export type InvalidatedResource="bookings"|"trips"|"engagements"|"feedback-links";

export function invalidateTripMutationData(bookingIds:string[]=[]){
  if(typeof window==="undefined")return;
  window.dispatchEvent(new CustomEvent(DATA_INVALIDATED_EVENT,{detail:{resources:["bookings","trips","engagements","feedback-links"] satisfies InvalidatedResource[],bookingIds}}));
}

export function invalidateEngagementFeedbackData(bookingIds:string[]=[]){
  if(typeof window==="undefined")return;
  window.dispatchEvent(new CustomEvent(DATA_INVALIDATED_EVENT,{detail:{resources:["bookings","engagements","feedback-links"] satisfies InvalidatedResource[],bookingIds}}));
}
