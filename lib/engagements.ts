import type { DriverEngagement } from "./contracts.ts";

/** Backend owns grouping; the frontend only orders and projects engagement cards. */
export function engagementCards(engagements:readonly DriverEngagement[]){
  return [...engagements].sort((a,b)=>a.sequenceNumber-b.sequenceNumber).map(engagement=>({
    id:engagement.id,
    sequenceNumber:engagement.sequenceNumber,
    driverName:engagement.driver.displayName,
    tripCount:engagement.trips.length,
    feedbackPurposes:[...engagement.feedbackPurposes],
  }));
}
