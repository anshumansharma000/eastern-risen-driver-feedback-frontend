import { ApiError } from './api.ts';
import type { AccessMethod, CreateTimelineEvent, DriverBookingContext, EventLocation, OperationalStatus, TimelineEvent, TimelineEventType } from './timeline-types.ts';
export const progressLabels: Record<OperationalStatus, string> = { UNKNOWN: 'Progress not recorded', SCHEDULED: 'Scheduled', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
export const eventLabels: Record<TimelineEventType, string> = { TRIP_STARTED: 'Start trip', PASSENGER_PICKED_UP: 'Passenger picked up', ARRIVED: 'Arrived', DROPPED_OFF: 'Passenger dropped off', TRIP_COMPLETED: 'Complete trip', NOTE: 'Note / photos', DELAY: 'Delay', CORRECTION: 'Correction' };
export function actionsFor(status: OperationalStatus): TimelineEventType[] {
    const base: TimelineEventType[] = ['NOTE', 'DELAY'];
    if (status === 'COMPLETED' || status === 'CANCELLED')
        return ['NOTE'];
    return [...((status === 'IN_PROGRESS' ? ['PASSENGER_PICKED_UP'] : ['TRIP_STARTED', 'PASSENGER_PICKED_UP']) as TimelineEventType[]), 'ARRIVED', 'DROPPED_OFF', 'TRIP_COMPLETED', ...base];
}
export const accessScope = (method: AccessMethod, driver: string, booking: string) => JSON.stringify([method, driver, booking]);
export function validLocation(l: EventLocation) { return Number.isFinite(l.latitude) && Math.abs(l.latitude) <= 90 && Number.isFinite(l.longitude) && Math.abs(l.longitude) <= 180 && Number.isFinite(l.accuracyMeters) && l.accuracyMeters >= 0 && Number.isFinite(Date.parse(l.capturedAt)); }
export function validateEntry(event: CreateTimelineEvent, startsAt: string, photoCount = event.photoIds?.length || 0): string | null {
    if ((event.note?.length || 0) > 4000)
        return 'Keep notes under 4,000 characters.';
    if (photoCount > 10)
        return 'Choose at most 10 photos.';
    if (['NOTE', 'DELAY'].includes(event.type) && !event.note?.trim() && !photoCount)
        return 'Add a note or at least one photo.';
    if (event.type === 'CORRECTION' && (!event.correctsEventId || !event.correctionReason?.trim() || event.correctionReason.length > 1000 || (!event.note?.trim() && !event.location)))
        return 'Add a correction reason and corrected note or location.';
    const occurred = Date.parse(event.occurredAt), recorded = Date.parse(event.recordedAt);
    if (!Number.isFinite(occurred) || !Number.isFinite(recorded) || occurred > recorded || occurred < Date.parse(startsAt) - 86400000 || recorded > Date.now() + 300000)
        return 'Check your device clock. The update must be within the booking reporting period and cannot be later than its recording time.';
    if (event.location && (!validLocation(event.location) || Math.abs(Date.parse(event.location.capturedAt) - recorded) > 300000))
        return 'Capture location again or continue without it.';
    return null;
}
export function assignmentProblem(event: CreateTimelineEvent, context: DriverBookingContext): string | null {
    const trip = context.trips.find(t => t.id === event.tripId);
    if (!trip || trip.assignmentVersion !== event.assignmentVersion)
        return 'The assignment has changed. Ask an admin to resolve this saved update.';
    if (Date.parse(context.reportingClosesAt) < Date.now())
        return 'The reporting window has closed. Ask an admin for current access.';
    if (trip.operationalStatus === 'CANCELLED' && !['NOTE', 'CORRECTION'].includes(event.type))
        return 'This trip was cancelled. Ask an admin to reopen it.';
    if (trip.operationalStatus === 'COMPLETED' && !['NOTE', 'CORRECTION'].includes(event.type) && (event.type === 'TRIP_COMPLETED' || !trip.completedAt || Date.parse(event.occurredAt) > Date.parse(trip.completedAt)))
        return 'This trip is completed. Ask an admin to reopen it for this update.';
    return null;
}
export function canonicalEvents(events: TimelineEvent[]) { const ids = new Set<string>(), clients = new Set<string>(); return events.filter(e => { if (ids.has(e.id) || clients.has(e.clientEventId))
    return false; ids.add(e.id); clients.add(e.clientEventId); return true; }).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id)); }
export function correctedEvent(original: TimelineEvent, all: TimelineEvent[]) {
    const corrections = all.filter(e => e.type === 'CORRECTION' && e.correctsEventId === original.id).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
    return { note: corrections.reduce((note, e) => e.note ?? note, original.note), location: corrections.reduce((loc, e) => e.location ?? loc, original.location), corrections };
}
const recovery: Record<string, string> = {
    DRIVER_LINK_INVALID: 'This link is invalid, expired or revoked. Ask your admin for a current link. Saved updates remain on this device.',
    DRIVER_ACCESS_REQUIRED: 'Active driver access is unavailable. Sign in with the assigned driver account.',
    DRIVER_BOOKING_NOT_ASSIGNED: 'This booking is no longer assigned to you. Saved updates need admin resolution.', TRIP_ACCESS_DENIED: 'This trip is no longer authorised. Saved updates need admin resolution.', TRIP_ASSIGNMENT_CHANGED: 'The assignment changed. Ask an admin to resolve the original saved update.', BOOKING_NOT_AVAILABLE: 'This booking is unavailable for reporting. Ask your admin for help.', DRIVER_REPORTING_WINDOW_CLOSED: 'Reporting has closed. Ask your admin to extend access.', TIMELINE_RETRY_CONFLICT: 'This saved update conflicts with an earlier attempt. Keep it for admin resolution; do not send a replacement.', TIMELINE_TIME_INVALID: 'Check your device clock and the entered time. Keep the saved update for review.', TIMELINE_LOCATION_TIME_INVALID: 'The location capture time cannot be accepted. Review the saved update.', TRIP_OPERATION_COMPLETED: 'The trip is already completed. A later milestone requires admin reopening.', TRIP_COMPLETION_BEFORE_START: 'Completion cannot be earlier than the recorded trip start.', TRIP_OPERATION_CANCELLED: 'This trip is cancelled. Ask an admin to reopen it.', PHOTO_STORAGE_UNAVAILABLE: 'Private photos are temporarily unavailable. Retry or explicitly remove photos before sending.', DRIVER_LINK_URL_NOT_CONFIGURED: 'Admin setup needed: configure the backend DRIVER_BOOKING_URL to this frontend’s /driver-booking URL.', DRIVER_LINK_EXPIRY_INVALID: 'Choose a future expiry within 30 days after the later of booking end or now.', TRIP_TIMELINE_BOOKING_LOCKED: 'Trips with operational history cannot move to another booking.', BOOKING_CHANGED: 'The booking changed. Refresh before editing.'
};
export function timelineError(error: unknown) { if (error instanceof ApiError)
    return `${recovery[error.code] || error.userMessage}${error.requestId ? ` (Support reference: ${error.requestId})` : ''}`; return error instanceof Error ? error.message : 'The update could not be sent. Your saved work remains here.'; }
export function validateExpiry(value: string, endsAt: string) { const time = Date.parse(value); return Number.isFinite(time) && time > Date.now() && time <= Math.max(Date.parse(endsAt), Date.now()) + 30 * 86400000; }

export const historyLabels: Record<TimelineEventType, string> = {TRIP_STARTED:"Trip started",PASSENGER_PICKED_UP:"Passenger picked up",ARRIVED:"Arrived",DROPPED_OFF:"Passenger dropped off",TRIP_COMPLETED:"Trip completed",NOTE:"Note",DELAY:"Delay reported",CORRECTION:"Correction"};

export const milestoneOrder: TimelineEventType[] = ['TRIP_STARTED', 'PASSENGER_PICKED_UP', 'ARRIVED', 'DROPPED_OFF', 'TRIP_COMPLETED'];
/** Recommendation only: milestones can still be recorded out of order. Context remains authoritative. */
export function nextMilestone(trip: DriverBookingContext['trips'][number], events: Pick<TimelineEvent, 'tripId' | 'assignmentVersion' | 'type' | 'occurredAt'>[], pending: Pick<CreateTimelineEvent, 'tripId' | 'assignmentVersion' | 'type' | 'occurredAt'>[] = []): TimelineEventType | null {
    if (trip.operationalStatus === 'COMPLETED' || trip.operationalStatus === 'CANCELLED') return null;
    const relevant = events.filter(e => e.tripId === trip.id && e.assignmentVersion === trip.assignmentVersion);
    // A previous completion with an active context indicates reopening. Do not reuse that sequence.
    const completedAt = relevant.filter(e => e.type === 'TRIP_COMPLETED').reduce((latest, e) => Math.max(latest, Date.parse(e.occurredAt)), 0);
    const current = [...relevant.filter(e => Date.parse(e.occurredAt) > completedAt), ...pending.filter(e => e.tripId === trip.id && e.assignmentVersion === trip.assignmentVersion && Date.parse(e.occurredAt) > completedAt)];
    if (current.some(e => e.type === 'TRIP_COMPLETED')) return null;
    let last = trip.operationalStatus === 'IN_PROGRESS' ? 0 : -1;
    for (const event of current) last = Math.max(last, milestoneOrder.indexOf(event.type));
    return milestoneOrder[last + 1] || null;
}
