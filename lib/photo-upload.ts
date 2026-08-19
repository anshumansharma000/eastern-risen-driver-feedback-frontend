import { ApiError, apiRequest } from "./api.ts";
import type { SubmitFeedbackRequest } from "./contracts.ts";

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";
export const PHOTO_PRELIMINARY_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface PhotoUploadIntentResponse {
  data:{ id:string; uploadUrl:string; method:"PUT"; headers:{"Content-Type":string}; expiresAt:string; maxBytes:number };
}
export interface CompletedPhotoResponse {
  data:{ id:string; status:"READY"; contentType:"image/jpeg"; byteSize:number; completedAt:string };
}

export type PhotoValidationError = { code:"PHOTO_INVALID"|"PHOTO_TOO_LARGE"; message:string };

export function formatPhotoSize(bytes:number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validatePhotoFile(file:Pick<File,"type"|"size">&{name?:string}, maxBytes=PHOTO_PRELIMINARY_MAX_BYTES):PhotoValidationError|null {
  if (!PHOTO_TYPES.has(file.type)) return {
    code:"PHOTO_INVALID",
    message:file.type === "image/heic" || file.type === "image/heif" || /\.hei[cf]$/i.test(file.name??"")
      ? "HEIC and HEIF photos are not supported. Take a new photo in JPEG, PNG, or WebP format, or continue without one."
      : "Choose a JPEG, PNG, or WebP photo, or continue without one.",
  };
  if (file.size > maxBytes) return { code:"PHOTO_TOO_LARGE", message:`This photo is larger than the ${formatPhotoSize(maxBytes)} limit. Choose a smaller photo or continue without one.` };
  return null;
}

export function photoErrorMessage(error:unknown) {
  const code=error instanceof ApiError?error.code:"";
  const details=error instanceof ApiError&&error.details&&typeof error.details==="object"?error.details as Record<string,unknown>:null;
  const maxBytes=typeof details?.maxBytes==="number"?details.maxBytes:null;
  if (code==="PHOTO_TOO_LARGE") return `This photo is larger than the ${maxBytes?formatPhotoSize(maxBytes):"configured"} limit. Choose another image or continue without one.`;
  if (code==="PHOTO_INVALID") return "The file was not a valid JPEG, PNG, or WebP image. Choose another image or continue without one.";
  if (code==="PHOTO_UPLOAD_MISSING") return "The photo upload did not arrive. Try again to create a new upload, or continue without the photo.";
  if (code==="PHOTO_UPLOAD_REJECTED") return "The photo could not be accepted. Choose a new image or continue without one.";
  if (code==="PHOTO_NOT_READY") return "The photo is not ready yet. Try again to finish processing, or submit without it.";
  if (code==="PHOTO_ATTACHMENT_CONFLICT") return "This photo could not be attached to the existing feedback submission. Retry with the same submission, or continue without the photo.";
  if (code==="PHOTO_STORAGE_UNAVAILABLE" || code==="NETWORK_UNAVAILABLE" || (error instanceof ApiError&&error.kind==="transport")) return "Photo upload needs a connection and is temporarily unavailable. You can try again or continue without the photo.";
  return error instanceof Error&&error.message?error.message:"The photo could not be uploaded. Try again or continue without it.";
}

export async function uploadDirectToR2(file:File,intent:PhotoUploadIntentResponse["data"],fetchImpl:typeof fetch=fetch,signal?:AbortSignal) {
  const response=await fetchImpl(intent.uploadUrl,{method:intent.method,headers:intent.headers,body:file,...(signal?{signal}:{})});
  if (!response.ok) throw new ApiError(response.status,"PHOTO_STORAGE_UNAVAILABLE","The photo storage service did not accept the upload.",undefined,undefined,"server");
}

type PassengerApi=<T>(path:string,init?:RequestInit&{passengerToken?:string;timeoutMs?:number})=>Promise<T>;
export async function uploadPassengerPhoto(file:File,token:string,options:{
  api?:PassengerApi; fetchImpl?:typeof fetch; signal?:AbortSignal;
  onIntent?:(intent:PhotoUploadIntentResponse["data"])=>void; onUploaded?:(photoId:string)=>void;
}={}) {
  const validation=validatePhotoFile(file);
  if (validation) throw new ApiError(validation.code==="PHOTO_TOO_LARGE"?413:422,validation.code,validation.message);
  const request=options.api??apiRequest;
  const intent=await request<PhotoUploadIntentResponse>("/api/v1/passenger/feedback/photo-uploads",{method:"POST",passengerToken:token,body:JSON.stringify({contentType:file.type,sizeBytes:file.size}),signal:options.signal});
  if (file.size > intent.data.maxBytes) throw new ApiError(413,"PHOTO_TOO_LARGE","The photo exceeds the server limit.",undefined,{maxBytes:intent.data.maxBytes});
  if (new Date(intent.data.expiresAt).getTime() <= Date.now()) throw new ApiError(409,"PHOTO_UPLOAD_MISSING","The photo upload intent expired before it could be used.");
  if (intent.data.headers["Content-Type"] !== file.type) throw new ApiError(422,"PHOTO_INVALID","The upload content type did not match the selected file.");
  options.onIntent?.(intent.data);
  await uploadDirectToR2(file,intent.data,options.fetchImpl,options.signal);
  options.onUploaded?.(intent.data.id);
  return request<CompletedPhotoResponse>(`/api/v1/passenger/feedback/photo-uploads/${encodeURIComponent(intent.data.id)}/complete`,{method:"POST",passengerToken:token,signal:options.signal,timeoutMs:30000});
}

export function omitPhotoForOffline(envelope:SubmitFeedbackRequest):SubmitFeedbackRequest {
  const withoutPhoto={...envelope};
  delete withoutPhoto.photoId;
  return withoutPhoto;
}
