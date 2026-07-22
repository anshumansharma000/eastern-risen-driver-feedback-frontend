export type AccountRole = "ADMIN" | "DRIVER";
export type LifecycleStatus = "ACTIVE" | "DEACTIVATED" | "ARCHIVED";
export type DriverSource = "AGENCY" | "OUTSOURCED";
export type TripCreationSource = "ADMIN_ASSIGNED" | "DRIVER_ENTERED";
export type TripStatus = "READY" | "FEEDBACK_STARTED" | "SUBMITTED" | "ARCHIVED";
export type QuestionType = "STAR_RATING" | "EMOJI_RATING" | "YES_NO" | "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TEXT";
export type QuestionCategory = "OVERALL_EXPERIENCE" | "DRIVING_SAFETY" | "PUNCTUALITY" | "CLEANLINESS" | "PROFESSIONALISM" | "VEHICLE_CONDITION" | "CUSTOM";

export interface Principal { accountId: string; role: AccountRole; displayName: string; driverId: string | null }
export interface Pagination { page: number; pageSize: number; total: number }
export interface Paginated<T> { data: T[]; pagination: Pagination }
export interface DataResponse<T> { data: T }

export interface VehicleSummary { id: string; registrationNumber: string; displayName: string; status?: LifecycleStatus }
export interface DriverSummary { id: string; displayName: string; driverCode: string; sourceType: DriverSource; vendorId: string | null; vendorName: string | null; status?: LifecycleStatus }
export interface Vendor { id:string; name:string; contactName:string|null; contactEmail:string|null; contactPhone:string|null; status:LifecycleStatus; createdAt:string; updatedAt:string; archivedAt:string|null }
export interface AdminDriver extends DriverSummary { accountId:string; email:string; phone:string|null; status:LifecycleStatus; createdAt:string; updatedAt:string; archivedAt:string|null }
export interface Vehicle extends VehicleSummary { status:LifecycleStatus; createdAt:string; updatedAt:string; archivedAt:string|null }
export interface QuestionnaireSummary { id:string; name:string; status:"ACTIVE"|"ARCHIVED"; createdAt:string; updatedAt:string; archivedAt:string|null }
export type QuestionnaireVersionStatus="DRAFT"|"ACTIVE"|"RETIRED"|"ARCHIVED";
export interface QuestionnaireVersionSummary { id:string; questionnaireId:string; versionNumber:number; status:QuestionnaireVersionStatus; publishedAt:string|null; retiredAt:string|null; createdAt:string; updatedAt:string }
export interface AdminQuestion { id:string; stableKey:string; prompt:string; questionType:QuestionType; category:QuestionCategory; status:"ACTIVE"|"INACTIVE"|"ARCHIVED"; isRequired:boolean; contributesToScore:boolean; displayOrder:number; scoreMin:number|null; scoreMax:number|null; options:PassengerOption[] }
export interface QuestionnaireVersion extends QuestionnaireVersionSummary { questionnaireName:string; questions:AdminQuestion[] }
export interface Trip {
  id: string; bookingReference: string; passengerName: string; pickupLocation: string; destination: string; scheduledAt: string;
  vehicle: VehicleSummary; driver: DriverSummary; creationSource: TripCreationSource; status: TripStatus;
  startedFeedbackAt: string | null; createdAt: string; updatedAt: string; archivedAt: string | null;
}
export interface HandoffTrip extends Trip { feedbackAccessToken: string; feedbackAccessTokenExpiresAt: string }
export interface PassengerOption { valueKey: string; label: string; scoreValue: number | null; displayOrder: number }
export interface PassengerQuestion {
  id: string; stableKey: string; prompt: string; questionType: QuestionType; category: QuestionCategory;
  isRequired: boolean; displayOrder: number; contributesToScore: boolean; scoreMin: number | null; scoreMax: number | null; options: PassengerOption[];
}
export interface QuestionnaireSnapshot { questionnaireId: string; questionnaireVersionId: string; versionNumber: number; questions: PassengerQuestion[] }
export interface ConsentVersion { id: string; version: number; content: string; effectiveAt: string; retiredAt: string | null }
export interface PassengerContext {
  trip: { id: string; bookingReference: string; pickupLocation: string; destination: string; scheduledAt: string; vehicle: Omit<VehicleSummary, "id">; driver: { displayName: string } };
  questionnaire: QuestionnaireSnapshot; consent: ConsentVersion;
}
export type AnswerValue = number | string | boolean | string[];
export interface FeedbackAnswer { questionId: string; value: AnswerValue }
export interface SubmitFeedbackRequest {
  clientSubmissionId: string; questionnaireVersionId: string; questionnaireSnapshot: QuestionnaireSnapshot;
  respondent: { name: string; phone: string; email: string; bookingReference: string; consentAccepted: true; consentedAt: string };
  answers: FeedbackAnswer[]; submittedAt: string; submissionMode: "ONLINE" | "OFFLINE_SYNC";
}
export interface SubmissionReceipt { id: string; clientSubmissionId: string; tripId: string; receivedAt: string; submissionMode: "ONLINE" | "OFFLINE_SYNC"; replayed: boolean; rewardEligible: boolean }
