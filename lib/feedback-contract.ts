import type { QuestionCategory } from "./contracts.ts";

export type AdminFeedbackFilters = {
  month?:string; driverId?:string; driverSource?:"AGENCY"|"OUTSOURCED"; vendorId?:string;
  reviewState?:"NORMAL"|"FLAGGED"|"ARCHIVED"; submissionMode?:"ONLINE"|"OFFLINE_SYNC";
  category?:QuestionCategory; minimumScore?:number; maximumScore?:number; negativeOnly?:boolean;
  page?:number; pageSize?:number;
};
export type AnalyticsFilters = Pick<AdminFeedbackFilters,"month"|"driverId"|"driverSource"|"vendorId"|"category">;

export function contractSearch(filters:Record<string,string|number|boolean|null|undefined>) {
  const search = new URLSearchParams();
  for (const [key,value] of Object.entries(filters)) if (value !== undefined && value !== null && value !== "") search.set(key,String(value));
  return search.toString();
}
export const adminFeedbackPath = (filters:AdminFeedbackFilters) => `/api/v1/admin/feedback?${contractSearch(filters)}`;
export const adminAnalyticsPath = (filters:AnalyticsFilters) => {
  const query=contractSearch(filters); return `/api/v1/admin/analytics${query?`?${query}`:""}`;
};
export const driverPerformancePath = (month?:string) => `/api/v1/driver/performance${month?`?month=${encodeURIComponent(month)}`:""}`;
export const validMonth = (value:string|null) => !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
export const scoreLabel = (value:number|null) => value === null ? "No scored feedback" : value.toFixed(2);
export const countLabel = (responses:number,answers:number) => `${responses} response${responses===1?"":"s"} · ${answers} scored answer${answers===1?"":"s"}`;
export function formatInTimezone(value:string,timezone:string) {
  try { return new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short",timeZone:timezone}).format(new Date(value)); }
  catch { return new Intl.DateTimeFormat("en-IN",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)); }
}
export const categoryLabel=(value:string)=>value.toLowerCase().replaceAll("_"," ").replace(/\b\w/g,letter=>letter.toUpperCase());

export type CacheScope="settings"|"passenger-context"|"feedback-lists"|"feedback-detail"|"analytics"|"driver-performance"|"timezone";
export function invalidateCaches(scopes:CacheScope[]) {
  if(typeof window!=="undefined") window.dispatchEvent(new CustomEvent("app-cache-invalidated",{detail:{scopes}}));
}
