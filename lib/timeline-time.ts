import { formatDateTime as date, formatTripRange as range } from './status.ts';
const configured = process.env.NEXT_PUBLIC_TIMELINE_TIMEZONE || 'Asia/Kolkata';
function timezone() { try {
    new Intl.DateTimeFormat('en', { timeZone: configured });
    return configured;
}
catch {
    return 'Asia/Kolkata';
} }
export const formatDateTime = (iso: string) => date(iso, timezone());
export const formatTripRange = (start: string, end: string) => range(start, end, timezone());
