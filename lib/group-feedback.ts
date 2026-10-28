import { ApiError, apiRequest } from "./api.ts";
import type { FeedbackLink, PassengerContext, SubmitFeedbackRequest } from "./contracts.ts";
import { feedbackLinkPath, type FeedbackLinkAudience } from "./feedback-link.ts";

export function readFeedbackMode<T extends { allowMultipleSubmissions: boolean }>(data: T): T {
  if (!data || typeof data.allowMultipleSubmissions !== "boolean") throw new ApiError(0, "MALFORMED_API_RESPONSE", "The feedback collection mode is missing.", undefined, undefined, "protocol");
  return data;
}
export const readPassengerContext = (data: PassengerContext) => readFeedbackMode(data);
export async function generateFeedbackLink(audience: FeedbackLinkAudience, id: string, mode?: boolean): Promise<FeedbackLink> {
  const response = await apiRequest<{data:FeedbackLink}>(feedbackLinkPath(audience,id), {method:"POST",body:JSON.stringify(mode === undefined ? {} : {allowMultipleSubmissions:mode})});
  return readFeedbackMode(response.data);
}
export async function closeGroupFeedback(id:string) {
  await apiRequest<void>(`/api/v1/admin/engagements/${encodeURIComponent(id)}/close-feedback`,{method:"POST"});
}
export function normalizeRespondentPhone(value:string): string {
  const raw=value.trim().replace(/[\s().-]/g,"");
  return raw.startsWith("00") ? `+${raw.slice(2)}` : raw;
}

// One response owns one immutable retry envelope, including timestamps and photo.
export class PassengerDraft {
  readonly id: string;
  private envelope: SubmitFeedbackRequest | null = null;
  constructor(id=crypto.randomUUID()) { this.id=id; }
  prepare(value:Omit<SubmitFeedbackRequest,"clientSubmissionId">): SubmitFeedbackRequest {
    this.envelope ??= structuredClone({...value,clientSubmissionId:this.id});
    return structuredClone(this.envelope);
  }
  correctRejectedPayload() { this.envelope=null; }
}
