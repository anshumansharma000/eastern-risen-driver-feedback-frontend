import type { E164Phone } from "./phone";

export type AccountRole = "ADMIN" | "DRIVER";
export type LifecycleStatus = "ACTIVE" | "DEACTIVATED" | "ARCHIVED";
export type DriverSource = "AGENCY" | "OUTSOURCED";
export type TripCreationSource = "ADMIN_ASSIGNED" | "DRIVER_ENTERED";
export type TripStatus = "READY" | "FEEDBACK_STARTED" | "SUBMITTED" | "ARCHIVED";
export type BookingStatus = "ACTIVE" | "COMPLETED" | "CANCELLED" | "ARCHIVED";
export type QuestionnairePurpose = "ARRIVAL_EXPERIENCE" | "DRIVER_FEEDBACK" | "TOUR_EXPERIENCE";
export type QuestionType = "STAR_RATING" | "EMOJI_RATING" | "YES_NO" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TEXT";
export type QuestionCategory = "OVERALL_EXPERIENCE" | "DRIVING_SAFETY" | "PUNCTUALITY" | "CLEANLINESS" | "PROFESSIONALISM" | "VEHICLE_CONDITION" | "ARRIVAL_EXPERIENCE" | "TOUR_EXPERIENCE" | "TOUR_COORDINATION" | "CUSTOM";

export interface Principal { accountId: string; role: AccountRole; displayName: string; driverId: string | null }
export interface AccountProfile {
  accountId: string;
  role: AccountRole;
  displayName: string;
  email: string;
  status: LifecycleStatus;
  passwordChangedAt: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface AdminProfile extends AccountProfile { role: "ADMIN" }
export interface DriverProfile extends AccountProfile {
  role: "DRIVER";
  driverId: string;
  driverCode: string;
  phone: E164Phone | null;
  sourceType: DriverSource;
  vendorId: string | null;
  vendorName: string | null;
  assignmentEnabled: boolean;
  shiftStartTime: string | null;
  shiftEndTime: string | null;
  timeZone: string;
  maxDailyDutyMinutes: number;
}
export type UpdateAdminProfileRequest = Partial<Pick<AdminProfile, "displayName" | "email">>;
export type UpdateDriverProfileRequest = Partial<Pick<DriverProfile, "displayName" | "email">> & { phone?: E164Phone | null };
export interface ChangePasswordRequest { currentPassword: string; newPassword: string }
export interface AdminResetDriverPasswordRequest { newPassword: string }
export interface Pagination { page: number; pageSize: number; total: number }
export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
};
export interface DataResponse<T> { data: T }
/** Standard error contract returned by every backend endpoint. */
export interface ApiValidationField { field:string; message:string; rule:string }
export interface ApiErrorDetails { fields?:ApiValidationField[] }
export interface ApiErrorEnvelope { code:string; message:string; developerMessage:string; details?:ApiErrorDetails; requestId:string }
export interface ApiErrorResponse { error:ApiErrorEnvelope }

export interface VehicleSummary { id: string; registrationNumber: string; displayName: string; status?: LifecycleStatus }
export interface DriverSummary {
  id: string; displayName: string; driverCode: string; sourceType: DriverSource; vendorId: string | null; vendorName: string | null; status?: LifecycleStatus;
  assignmentEnabled: boolean; shiftStartTime: string | null; shiftEndTime: string | null; timeZone: string; maxDailyDutyMinutes: number;
}
export interface DriverLicense {
  id: string; licenseNumber: string | null; issuedOn: string | null; expiresOn: string | null;
  issuingAuthority: string | null; categories: string[] | null; verifiedAt: string | null;
}
export interface Vendor { id:string; name:string; contactName:string|null; contactEmail:string|null; contactPhone:E164Phone|null; status:LifecycleStatus; createdAt:string; updatedAt:string; archivedAt:string|null }
export interface AdminDriver extends DriverSummary { accountId:string; email:string; phone:E164Phone|null; status:LifecycleStatus; license:DriverLicense|null; createdAt:string; updatedAt:string; archivedAt:string|null }
export interface CreateVendorRequest { name:string; contactName:string|null; contactEmail:string|null; contactPhone:E164Phone|null }
export interface Vehicle extends VehicleSummary { status:LifecycleStatus; createdAt:string; updatedAt:string; archivedAt:string|null }
export interface QuestionnaireSummary { id:string; name:string; purpose:QuestionnairePurpose; status:"ACTIVE"|"ARCHIVED"; createdAt:string; updatedAt:string; archivedAt:string|null }
export type QuestionnaireVersionStatus="DRAFT"|"ACTIVE"|"RETIRED"|"ARCHIVED";
export interface QuestionnaireVersionSummary { id:string; questionnaireId:string; purpose:QuestionnairePurpose; versionNumber:number; status:QuestionnaireVersionStatus; publishedAt:string|null; retiredAt:string|null; createdAt:string; updatedAt:string }
export interface AdminQuestion { id:string; stableKey:string; prompt:string; questionType:QuestionType; category:QuestionCategory; status:"ACTIVE"|"INACTIVE"|"ARCHIVED"; isRequired:boolean; contributesToScore:boolean; displayOrder:number; scoreMin:number|null; scoreMax:number|null; options:PassengerOption[] }
export interface QuestionnaireVersion extends QuestionnaireVersionSummary { questionnaireName:string; questions:AdminQuestion[] }
export interface Trip {
  id: string; booking: { id:string; bookingReference:string; passengerName:string }; pickupLocation: string; destination: string; scheduledAt: string; scheduledEndAt: string;
  vehicle: VehicleSummary; driver: DriverSummary; creationSource: TripCreationSource; status: TripStatus;
  feedbackPurposes: QuestionnairePurpose[];
  startedFeedbackAt: string | null; createdAt: string; updatedAt: string; archivedAt: string | null;
}
export interface Booking {
  id:string; bookingReference:string; tourName:string|null; fileNumber:string|null; passengerName:string; passengerPhone:E164Phone|null; startsAt:string; endsAt:string; status:BookingStatus;
  notes:string|null; tripCount:number; createdAt:string; updatedAt:string; archivedAt:string|null;
}
export interface BookingFeedbackWarning { code:"ARRIVAL_FEEDBACK_MISSING"|"ARRIVAL_FEEDBACK_NOT_ON_FIRST_TRIP"|"TOUR_FEEDBACK_MISSING"|"TOUR_FEEDBACK_NOT_ON_LAST_TRIP"; message:string; tripId:string|null }
export interface BookingDetail extends Booking { trips:Trip[]; feedbackWarnings:BookingFeedbackWarning[] }
export interface CreateBookingRequest {
  bookingReference:string; tourName?:string|null; fileNumber?:string|null; passengerName:string; passengerPhone:E164Phone; startsAt:string; endsAt:string; notes?:string|null;
}
export type UpdateBookingRequest = Partial<Pick<CreateBookingRequest,"bookingReference"|"tourName"|"fileNumber"|"passengerName"|"passengerPhone"|"startsAt"|"endsAt"|"notes">>;
export interface DriverLeave { id:string; driverId:string; startsAt:string; endsAt:string; reason:string|null; createdAt:string }
export interface HandoffTrip extends Trip { feedbackAccessToken: string; feedbackAccessTokenExpiresAt: string; feedbackLink: string }
export interface FeedbackLink {
  tripId: string;
  feedbackLink: string;
  feedbackAccessTokenExpiresAt: string;
}
export interface AdminFeedbackShare extends FeedbackLink {
  recipient: { name:string; phone:E164Phone|null };
}
export interface AdminFeedbackShareResponse { data:AdminFeedbackShare }
export interface PassengerOption { valueKey: string; label: string; scoreValue: number | null; displayOrder: number }
export interface PassengerQuestion {
  id: string; stableKey: string; prompt: string; questionType: QuestionType; category: QuestionCategory;
  isRequired: boolean; displayOrder: number; contributesToScore: boolean; scoreMin: number | null; scoreMax: number | null; options: PassengerOption[];
}
export interface QuestionnaireSection { purpose:QuestionnairePurpose; title:string; questionnaireId:string; questionnaireVersionId:string; versionNumber:number; questions:PassengerQuestion[] }
export interface QuestionnaireSnapshot { schemaVersion:2; sections:QuestionnaireSection[] }
export interface ConsentVersion { id: string; version: number; content: string; effectiveAt: string; retiredAt: string | null }
export interface PassengerContext {
  trip: { id: string; bookingReference: string; pickupLocation: string; destination: string; scheduledAt: string; scheduledEndAt: string; vehicle: Omit<VehicleSummary, "id">; driver: { displayName: string } };
  questionnaire: QuestionnaireSnapshot; consent: ConsentVersion;
  completion: { agencyName: string; timezone: string; thankYouMessage: string };
}
export interface PassengerFeedbackStart { tripId:string; status:"FEEDBACK_STARTED"; startedFeedbackAt:string }
export type AnswerValue = number | string | boolean | string[];
export interface FeedbackAnswer { questionId: string; value: AnswerValue }
export interface SubmitFeedbackRequest {
  clientSubmissionId: string; questionnaireSnapshot: QuestionnaireSnapshot;
  respondent: { name: string; phone: E164Phone; email: string; bookingReference: string; consentAccepted: true; consentedAt: string };
  answers: FeedbackAnswer[]; submittedAt: string; submissionMode: "ONLINE" | "OFFLINE_SYNC"; photoId?: string;
}
export interface SubmissionReceipt { id: string; clientSubmissionId: string; tripId: string; receivedAt: string; submissionMode: "ONLINE" | "OFFLINE_SYNC"; replayed: boolean; rewardEligible: boolean }

export type FeedbackReviewState = "NORMAL" | "FLAGGED" | "ARCHIVED";
export type FeedbackSubmissionMode = "ONLINE" | "OFFLINE_SYNC";
export type AdminFeedbackView = "DRIVER" | "COMPANY";
export interface AgencySettings {
  id:string; agencyName:string; timezone:string; defaultThankYouMessage:string; negativeFeedbackThreshold:number|null; createdAt:string; updatedAt:string;
}
export type UpdateAgencySettingsRequest = Partial<Pick<AgencySettings,"agencyName"|"timezone"|"defaultThankYouMessage"|"negativeFeedbackThreshold">>;
export interface FeedbackListMeta { timezone:string; dateBasis:"SUBMITTED_AT" }
export interface AdminFeedbackSummary {
  id:string; tripId:string; bookingReference:string; respondentName:string;
  driver:{ id:string; displayName:string; sourceType:DriverSource; vendorId:string|null; vendorName:string|null };
  submittedAt:string; receivedAt:string; submissionMode:FeedbackSubmissionMode; reviewState:FeedbackReviewState; overallScore:number|null;
}
export interface AdminFeedbackAnswer {
  id:string; questionId:string; stableKey:string; prompt:string; questionType:QuestionType; category:QuestionCategory; purpose:QuestionnairePurpose; displayOrder:number; value:unknown; numericScore:number|null;
}
export interface FeedbackReviewEvent {
  id:string; action:"FLAG"|"UNFLAG"|"ARCHIVE"; reason:string|null; performedBy:{accountId:string;displayName:string}; createdAt:string;
}
export interface AdminFeedbackPhotoSummary { id:string; contentType:string; byteSize:number; attachedAt:string }
export interface AdminFeedbackPhotoAccessResponse { data:{ id:string; url:string; expiresAt:string; contentType:string; byteSize:number } }
export interface AdminFeedbackDetail extends AdminFeedbackSummary {
  respondent:{name:string;phone:E164Phone;email:string;bookingReference:string};
  trip:{pickupLocation:string;destination:string;scheduledAt:string;scheduledEndAt:string;vehicle:{registrationNumber:string;displayName:string}};
  consentVersionId:string; consentedAt:string; questionnaireSections:Array<{purpose:QuestionnairePurpose;questionnaireVersionId:string;displayOrder:number}>; answers:AdminFeedbackAnswer[]; reviewHistory:FeedbackReviewEvent[]; photo:AdminFeedbackPhotoSummary|null;
}
export interface ScoreSummary { averageScore:number|null; responseCount:number; answerCount:number }
export interface AnalyticsMeta { timezone:string; dateBasis:"SUBMITTED_AT"; month:string|null }
export interface DriverPerformance {
  driverId:string; overall:ScoreSummary; categories:Array<ScoreSummary&{category:QuestionCategory}>; monthlyTrend:Array<ScoreSummary&{month:string}>; meta:AnalyticsMeta;
}
export interface AdminAnalytics {
  overall:ScoreSummary; negativeFeedbackCount:number|null; negativeFeedbackThreshold:number|null;
  categories:Array<ScoreSummary&{category:QuestionCategory}>;
  drivers:Array<ScoreSummary&{driver:AdminFeedbackSummary["driver"]}>;
  sources:Array<ScoreSummary&{sourceType:DriverSource}>;
  vendors:Array<ScoreSummary&{vendorId:string;vendorName:string}>;
  monthlyTrend:Array<ScoreSummary&{month:string}>; meta:AnalyticsMeta;
}
