export type OperationalStatus = 'UNKNOWN' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type TimelineEventType = 'TRIP_STARTED' | 'PASSENGER_PICKED_UP' | 'ARRIVED' | 'DROPPED_OFF' | 'TRIP_COMPLETED' | 'NOTE' | 'DELAY' | 'CORRECTION';
export type AccessMethod = 'LOGIN' | 'LINK';
export type SubmissionMode = 'ONLINE' | 'OFFLINE_SYNC';
export interface EventLocation {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    capturedAt: string;
}
export interface DriverBookingContext {
    booking: {
        id: string;
        bookingReference: string;
        passengerName: string;
        startsAt: string;
        endsAt: string;
        status: 'ACTIVE' | 'COMPLETED';
    };
    driverId: string;
    accessMethod: AccessMethod;
    expiresAt: string | null;
    reportingClosesAt: string;
    trips: Array<{
        id: string;
        assignmentVersion: number;
        pickupLocation: string;
        destination: string;
        scheduledAt: string;
        scheduledEndAt: string;
        vehicle: {
            registrationNumber: string;
            displayName: string;
        };
        operationalStatus: OperationalStatus;
        startedAt: string | null;
        completedAt: string | null;
    }>;
}
export interface CreateTimelineEvent {
    clientEventId: string;
    tripId: string;
    assignmentVersion: number;
    type: TimelineEventType;
    occurredAt: string;
    recordedAt: string;
    submissionMode: SubmissionMode;
    note?: string;
    location?: EventLocation;
    photoIds?: string[];
    correctsEventId?: string;
    correctionReason?: string;
}
export interface TimelineReceipt {
    id: string;
    receivedAt: string;
    replayed: boolean;
}
export interface TimelineEvent {
    id: string;
    clientEventId: string;
    bookingId: string;
    tripId: string;
    driverId: string;
    driverNameSnapshot: string;
    assignmentVersion: number;
    actorAccountId: string | null;
    linkId: string | null;
    type: TimelineEventType;
    note: string | null;
    location: EventLocation | null;
    occurredAt: string;
    recordedAt: string;
    receivedAt: string;
    submissionMode: SubmissionMode;
    correctsEventId: string | null;
    correctionReason: string | null;
    accessMethod: AccessMethod;
    backdated: boolean;
    photos: Array<{
        id: string;
    }>;
}
export interface TripOverviewRow {
    tripId: string;
    bookingId: string;
    bookingReference: string;
    bookingStatus: string;
    driverId: string;
    driverName: string;
    assignmentVersion: number;
    scheduledAt: string;
    scheduledEndAt: string;
    pickupLocation: string;
    destination: string;
    operationalStatus: OperationalStatus;
    startedAt: string | null;
    completedAt: string | null;
    latestUpdate: {
        id: string;
        type: TimelineEventType;
        occurredAt: string;
        receivedAt: string;
        driverName: string;
    } | null;
    readyToClose: boolean;
}
export interface IssuedDriverLink {
    id: string;
    bookingId: string;
    driverId: string;
    expiresAt: string;
    link: string;
}
export interface PhotoUploadIntent {
    tripId: string;
    assignmentVersion: number;
    contentType: 'image/jpeg' | 'image/png' | 'image/webp';
    sizeBytes: number;
}
export interface PhotoUploadResponse {
    id: string;
    uploadUrl: string;
    method: 'PUT';
    headers: {
        'Content-Type': string;
    };
    expiresAt: string;
    maxBytes: number;
}
export interface CompletedPhoto {
    id: string;
    status: 'READY' | 'ATTACHED';
    completedAt: string | null;
}
export interface PrivatePhotoUrl {
    id: string;
    url: string;
    expiresAt: string;
}
