import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { backoffDelay, canRetry } from "../lib/retry-policy.ts";
import { assignmentErrorFields, changedTripFields, normalizeLocation, validateTripSchedule } from "../lib/trip-scheduling.ts";
import { ApiError, apiRequest, errorMessage, errorPresentation, normalizeFieldPath, resolveFormFieldErrors } from "../lib/api.ts";
import { assignmentSettingsFromForm, driverMutationFromForm, dutyMinutes, validateAssignmentSettings, validateDriverLicense } from "../lib/driver-scheduling.ts";
import { boundedPage, pageAfterRemovingLastItem, parsePaginatedResponse, totalPages, updateListSearch } from "../lib/pagination.ts";
import { filterComboboxOptions } from "../lib/combobox.ts";
import { adminAnalyticsPath, adminFeedbackPath, contractSearch, countLabel, driverPerformancePath, scoreLabel, validMonth } from "../lib/feedback-contract.ts";
import {
  accountPaths,
  changePassword,
  changedProfileFields,
  getAdminDriver,
  getAdminProfile,
  getDriverProfile,
  passwordValidation,
  resetAdminDriverPassword,
  updateAdminProfile,
  updateDriverProfile,
} from "../lib/account-api.ts";
import { formatTripRange } from "../lib/status.ts";
import { copyFeedbackLink, feedbackLinkFromHandoff, feedbackLinkPath, formatFeedbackLinkExpiry, isFeedbackLinkExpired, passengerTokenFromSearch, shareFeedbackLink } from "../lib/feedback-link.ts";
import { backendPassengerPhoneError, canonicalPassengerPhone, E164_ERROR, passengerPhoneError } from "../lib/booking-phone.ts";
import { bookingMetadataErrors, bookingMetadataFromForm, FILE_NUMBER_MAX_LENGTH, optionalText, TOUR_NAME_MAX_LENGTH } from "../lib/booking-metadata.ts";
import { buildE164, E164_PATTERN, optionalPhoneValue, parsePhoneValue, PHONE_COUNTRIES, phoneError } from "../lib/phone.ts";
import { buildWhatsAppFeedbackMessage, buildWhatsAppShareUrl, openAdminFeedbackOnWhatsApp, openFeedbackOnWhatsApp } from "../lib/whatsapp-feedback.ts";
import { omitPhotoForOffline, PHOTO_ACCEPT, PHOTO_PRELIMINARY_MAX_BYTES, uploadDirectToR2, uploadPassengerPhoto, validatePhotoFile } from "../lib/photo-upload.ts";
import { engagementCards } from "../lib/engagements.ts";

test("backend engagement groups render in sequence with derived sections and trip counts", () => {
  const make=(id,sequenceNumber,driverName,tripCount,feedbackPurposes)=>({id,sequenceNumber,driver:{displayName:driverName},trips:Array.from({length:tripCount},(_,i)=>({id:`${id}-${i}`})),feedbackPurposes});
  assert.deepEqual(engagementCards([make("only",1,"A",3,["ARRIVAL_EXPERIENCE","DRIVER_FEEDBACK","TOUR_EXPERIENCE"])]),[{id:"only",sequenceNumber:1,driverName:"A",tripCount:3,feedbackPurposes:["ARRIVAL_EXPERIENCE","DRIVER_FEEDBACK","TOUR_EXPERIENCE"]}]);
  assert.deepEqual(engagementCards([make("a2",3,"A",1,["DRIVER_FEEDBACK","TOUR_EXPERIENCE"]),make("a1",1,"A",2,["ARRIVAL_EXPERIENCE","DRIVER_FEEDBACK"]),make("b1",2,"B",2,["DRIVER_FEEDBACK"])]).map(({driverName,tripCount,feedbackPurposes})=>({driverName,tripCount,feedbackPurposes})),[
    {driverName:"A",tripCount:2,feedbackPurposes:["ARRIVAL_EXPERIENCE","DRIVER_FEEDBACK"]},
    {driverName:"B",tripCount:2,feedbackPurposes:["DRIVER_FEEDBACK"]},
    {driverName:"A",tripCount:1,feedbackPurposes:["DRIVER_FEEDBACK","TOUR_EXPERIENCE"]},
  ]);
});

test("passenger and admin feedback UIs use composite questionnaire sections", () => {
  const passenger=readFileSync(new URL("../components/passenger-flow.tsx",import.meta.url),"utf8");
  const detail=readFileSync(new URL("../components/admin-feedback-detail.tsx",import.meta.url),"utf8");
  const trips=readFileSync(new URL("../components/admin-trips.tsx",import.meta.url),"utf8");
  assert.match(passenger,/questionnaire\.sections\.flatMap/);
  assert.doesNotMatch(passenger,/questionnaireVersionId:context\.questionnaire/);
  assert.match(detail,/answer\.purpose/);
  assert.doesNotMatch(trips,/name="feedbackPurposes"|FeedbackSectionFields/);
});

test("admin feedback view keeps driver and company records and detail answers separate", () => {
  const list=readFileSync(new URL("../components/admin-feedback-list.tsx",import.meta.url),"utf8");
  const detail=readFileSync(new URL("../components/admin-feedback-detail.tsx",import.meta.url),"utf8");
  const route=readFileSync(new URL("../components/query-detail-routes.tsx",import.meta.url),"utf8");
  assert.match(list,/<option value="DRIVER">Driver feedback<\/option>/);
  assert.match(list,/<option value="COMPANY">Company feedback<\/option>/);
  assert.match(list,/&view=\$\{view\}/);
  assert.match(list,/view==="DRIVER"\?"Driver":"Feedback sections"/);
  assert.match(list,/view==="DRIVER"\?<><strong>\{item\.driver\.displayName\}/);
  assert.match(list,/:<CompanyFeedbackSections\/>/);
  assert.match(detail,/answer\.purpose==="DRIVER_FEEDBACK"/);
  assert.match(detail,/feedback\/\$\{encodeURIComponent\(feedbackId\)\}\?view=\$\{view\}/);
  assert.match(route,/requestedView === "COMPANY" \? "COMPANY" : "DRIVER"/);
});

test("passenger photo inputs distinguish camera capture from library selection", () => {
  const passenger=readFileSync(new URL("../components/passenger-flow.tsx",import.meta.url),"utf8");
  assert.equal(PHOTO_ACCEPT,"image/jpeg,image/png,image/webp");
  assert.match(passenger,/id="camera-photo" type="file" accept=\{PHOTO_ACCEPT\} capture="environment"/);
  assert.match(passenger,/id="library-photo" type="file" accept=\{PHOTO_ACCEPT\} onChange=\{choosePhoto\}/);
  assert.doesNotMatch(passenger,/id="library-photo"[^>]*capture=/);
});

test("unsupported and preliminary oversized photos are rejected locally", () => {
  assert.equal(validatePhotoFile({type:"image/jpeg",size:PHOTO_PRELIMINARY_MAX_BYTES}),null);
  assert.equal(validatePhotoFile({type:"application/pdf",size:100})?.code,"PHOTO_INVALID");
  assert.match(validatePhotoFile({type:"image/heic",size:100})?.message??"",/HEIC and HEIF photos are not supported/);
  assert.match(validatePhotoFile({type:"",size:100,name:"camera.HEIF"})?.message??"",/HEIC and HEIF photos are not supported/);
  assert.equal(validatePhotoFile({type:"image/png",size:PHOTO_PRELIMINARY_MAX_BYTES+1})?.code,"PHOTO_TOO_LARGE");
});

test("direct R2 upload uses only the presigned method and headers", async () => {
  const file=new Blob(["image-bytes"],{type:"image/jpeg"});
  const intent={id:"photo-1",uploadUrl:"https://private-upload.example/one",method:"PUT",headers:{"Content-Type":"image/jpeg"},expiresAt:"2099-01-01T00:00:00.000Z",maxBytes:1000};
  let request;
  await uploadDirectToR2(file,intent,async(url,init)=>{request={url,init};return new Response(null,{status:200})});
  assert.equal(request.url,intent.uploadUrl);
  assert.equal(request.init.method,"PUT");
  assert.equal(request.init.headers,intent.headers);
  assert.equal(request.init.body,file);
  assert.equal(request.init.credentials,undefined);
  assert.equal(new Headers(request.init.headers).get("authorization"),null);
});

test("photo completion follows a successful R2 upload and never follows a failed one", async () => {
  const file=new Blob(["image-bytes"],{type:"image/jpeg"});
  const calls=[];
  const api=async(path,init)=>{calls.push({kind:"api",path,init});if(path.endsWith("photo-uploads"))return{data:{id:"photo-1",uploadUrl:"https://private-upload.example/one",method:"PUT",headers:{"Content-Type":"image/jpeg"},expiresAt:"2099-01-01T00:00:00.000Z",maxBytes:1000}};return{data:{id:"photo-1",status:"READY",contentType:"image/jpeg",byteSize:11,completedAt:"2030-01-01T00:00:00.000Z"}}};
  await uploadPassengerPhoto(file,"feedback-token",{api,fetchImpl:async()=>{calls.push({kind:"r2"});return new Response(null,{status:200})}});
  assert.deepEqual(calls.map(call=>call.kind),["api","r2","api"]);
  assert.match(calls[2].path,/photo-uploads\/photo-1\/complete$/);
  assert.equal(calls[0].init.passengerToken,"feedback-token");
  assert.equal(calls[2].init.passengerToken,"feedback-token");
  const failed=[];
  await assert.rejects(()=>uploadPassengerPhoto(file,"feedback-token",{api:async(path)=>{failed.push(path);return{data:{id:"photo-2",uploadUrl:"https://private-upload.example/two",method:"PUT",headers:{"Content-Type":"image/jpeg"},expiresAt:"2099-01-01T00:00:00.000Z",maxBytes:1000}}},fetchImpl:async()=>new Response(null,{status:500})}));
  assert.equal(failed.length,1);
});

test("offline feedback envelopes always omit photoId", () => {
  const envelope={clientSubmissionId:"submission-1",photoId:"photo-1",submissionMode:"ONLINE"};
  assert.deepEqual(omitPhotoForOffline(envelope),{clientSubmissionId:"submission-1",submissionMode:"ONLINE"});
});

test("passenger photo state prevents stale updates and releases previews", () => {
  const passenger=readFileSync(new URL("../components/passenger-flow.tsx",import.meta.url),"utf8");
  assert.match(passenger,/URL\.createObjectURL\(file\)/);
  assert.match(passenger,/URL\.revokeObjectURL\(previewUrl\)/);
  assert.match(passenger,/photoGeneration\.current\+=1/);
  assert.match(passenger,/if\(generation!==photoGeneration\.current\)return/);
  assert.match(passenger,/setPhoto\(\{kind:"empty"\}\)/);
  assert.match(passenger,/omitPhotoForOffline\(envelope\)/g);
  assert.match(passenger,/\.\.\.\(photoId\?\{photoId\}:\{\}\)/);
});

test("admin photo details are nullable and signed URLs are memory-only and refreshed", () => {
  const admin=readFileSync(new URL("../components/admin-feedback-detail.tsx",import.meta.url),"utf8");
  const contracts=readFileSync(new URL("../lib/contracts.ts",import.meta.url),"utf8");
  assert.match(contracts,/photo:AdminFeedbackPhotoSummary\|null/);
  assert.match(admin,/\{detail\.photo&&<section/);
  assert.match(admin,/\/photo-url/);
  assert.match(admin,/onClick=\{\(\)=>\{refreshedAfterFailure\.current=false;void viewPhoto\(true\)\}\}/);
  assert.match(admin,/onError=\{\(\)=>void refreshFailedPhoto\(\)\}/);
  assert.match(admin,/alt="Passenger-provided trip photo with the driver"/);
  assert.doesNotMatch(admin,/localStorage|sessionStorage|console\./);
});

test("feedback-link endpoints preserve admin and assigned-driver engagement boundaries", () => {
  assert.equal(feedbackLinkPath("admin", "engagement/one"), "/api/v1/admin/engagements/engagement%2Fone/feedback-link");
  assert.equal(feedbackLinkPath("driver", "engagement/one"), "/api/v1/driver/engagements/engagement%2Fone/feedback-link");
  assert.equal(errorMessage(new ApiError(404, "TRIP_NOT_FOUND", "backend")), "This trip is unavailable or is not assigned to you.");
});

test("handoff uses the complete backend feedback link and formats expiry locally", () => {
  const data = feedbackLinkFromHandoff({
    id: "engagement-1",
    feedbackLink: "https://feedback.example/feedback?token=opaque.value",
    feedbackAccessTokenExpiresAt: "2030-01-02T03:04:00.000Z",
  });
  assert.deepEqual(data, {
    engagementId: "engagement-1",
    feedbackLink: "https://feedback.example/feedback?token=opaque.value",
    feedbackAccessTokenExpiresAt: "2030-01-02T03:04:00.000Z",
  });
  assert.equal(isFeedbackLinkExpired(data.feedbackAccessTokenExpiresAt, new Date("2030-01-02T03:03:59.000Z")), false);
  assert.equal(isFeedbackLinkExpired(data.feedbackAccessTokenExpiresAt, new Date("2030-01-02T03:04:00.000Z")), true);
  assert.notEqual(formatFeedbackLinkExpiry(data.feedbackAccessTokenExpiresAt, "en-IN"), "Expiration unavailable");
});

test("passenger feedback reads only the token query parameter", () => {
  assert.equal(passengerTokenFromSearch("?token=opaque%20token&campaign=ignored"), "opaque token");
  assert.equal(passengerTokenFromSearch("?campaign=missing"), null);
  assert.equal(passengerTokenFromSearch("?token=%20%20"), null);
});

test("passenger API calls send the query token as a Bearer credential without cookies", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({ data: { ok:true } }), { status:200, headers:{ "content-type":"application/json" } });
  };
  try {
    await apiRequest("/api/v1/passenger/feedback/context", { passengerToken:"opaque.token" });
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(new Headers(request.init.headers).get("authorization"), "Bearer opaque.token");
  assert.equal(request.init.credentials, "omit");
});

test("standard API field errors remove transport prefixes, map known form fields, and retain unmapped summary items", () => {
  const error = new ApiError(422, "REQUEST_VALIDATION_FAILED", "Please check the form.", "request-1", {
    fields: [
      { field:"body.email", message:"Enter a valid email address.", rule:"email" },
      { field:"query.page", message:"Page must be positive.", rule:"min" },
      { field:"params.id", message:"ID is invalid.", rule:"uuid" },
      { field:"body.respondent.phone", message:"Enter an international phone number.", rule:"e164" },
    ],
  });
  assert.equal(normalizeFieldPath("body.email"), "email");
  assert.equal(normalizeFieldPath("query.page"), "page");
  assert.equal(normalizeFieldPath("params.id"), "id");
  const resolved = resolveFormFieldErrors(error, ["email", "page", "respondent.phone"]);
  assert.deepEqual(resolved.byField, { email:"Enter a valid email address.", page:"Page must be positive.", "respondent.phone":"Enter an international phone number." });
  assert.equal(resolved.firstField, "email");
  assert.deepEqual(resolved.unmapped.map((field) => field.field), ["id"]);
  assert.equal(resolved.summary.length, 4);
});

test("known API codes use actionable copy while unknown codes preserve the backend user message", () => {
  const known = new ApiError(409, "DRIVER_SCHEDULE_CONFLICT", "Backend copy", "request-known", undefined, "conflict", { developerMessage:"Overlap in allocation table" });
  const unknown = new ApiError(409, "NEW_DOMAIN_REJECTION", "The selected record changed. Review it and try again.", "request-unknown", undefined, "conflict", { developerMessage:"Optimistic version mismatch" });
  assert.equal(errorMessage(known), "The selected driver already has another trip during this time.");
  assert.equal(errorMessage(unknown), "The selected record changed. Review it and try again.");
  assert.notEqual(errorMessage(unknown), unknown.developerMessage);
});

test("error presentation keeps developer diagnostics separate from primary user copy", () => {
  const presented = errorPresentation(new ApiError(500, "INTERNAL_SERVER_ERROR", "User-safe backend message", "request-safe", undefined, "server", { developerMessage:"Database pool exhausted at internal host" }));
  assert.equal(presented.message, "The service encountered a problem. Your information is still here; try again.");
  assert.equal(presented.developerMessage, "Database pool exhausted at internal host");
  assert.equal(presented.requestId, "request-safe");
  assert.doesNotMatch(presented.message, /Database|internal host|request-safe/);
  const sensitive = errorPresentation(new ApiError(422, "NEW_REJECTION", "Contact passenger@example.com or +91 98765 43210.", "request-redacted", undefined, "validation", { developerMessage:"token=super-secret-credential-value; answers: private response" }));
  assert.doesNotMatch(sensitive.message, /passenger@example|98765|43210/);
  assert.doesNotMatch(sensitive.developerMessage, /super-secret|private response/);
  const ui = readFileSync(new URL("../components/ui.tsx", import.meta.url), "utf8");
  assert.match(ui, /<summary>Technical details<\/summary>/);
  assert.match(ui, /Developer message/);
  assert.match(ui, /Request ID/);
});

async function captureApiFailure(responseOrFailure) {
  const originalFetch = globalThis.fetch;
  const originalConsole = console.error;
  console.error = () => undefined;
  globalThis.fetch = typeof responseOrFailure === "function" ? responseOrFailure : async () => responseOrFailure;
  try { await apiRequest("/api/v1/admin/test"); }
  catch (error) { return error; }
  finally { globalThis.fetch = originalFetch; console.error = originalConsole; }
  assert.fail("Expected API request to fail");
}

test("standardized errors use x-request-id only when body requestId is absent", async () => {
  const withoutBodyId = await captureApiFailure(new Response(JSON.stringify({ error:{ code:"NEW_DOMAIN_REJECTION", message:"Review this record.", developerMessage:"Version mismatch" } }), { status:409, headers:{ "content-type":"application/json", "x-request-id":"header-request" } }));
  assert.ok(withoutBodyId instanceof ApiError);
  assert.equal(withoutBodyId.requestId, "header-request");
  const withBodyId = await captureApiFailure(new Response(JSON.stringify({ error:{ code:"NEW_DOMAIN_REJECTION", message:"Review this record.", developerMessage:"Version mismatch", requestId:"body-request" } }), { status:409, headers:{ "content-type":"application/json", "x-request-id":"header-request" } }));
  assert.equal(withBodyId.requestId, "body-request");
});

test("malformed, non-JSON, and network failures are local safe errors distinct from backend rejections", async () => {
  const malformed = await captureApiFailure(new Response("<html>gateway failure</html>", { status:502, headers:{ "content-type":"text/html", "x-request-id":"gateway-request" } }));
  assert.equal(malformed.code, "MALFORMED_API_RESPONSE");
  assert.equal(malformed.isBackendRejection, false);
  assert.equal(malformed.requestId, "gateway-request");
  assert.doesNotMatch(malformed.userMessage, /html|gateway failure/);
  const invalidJson = await captureApiFailure(new Response("{not-json", { status:500, headers:{ "content-type":"application/json" } }));
  assert.equal(invalidJson.code, "MALFORMED_API_RESPONSE");
  const network = await captureApiFailure(async () => { throw new TypeError("fetch failed with token=secret"); });
  assert.equal(network.code, "NETWORK_FAILURE");
  assert.equal(network.kind, "transport");
  assert.equal(network.retryable, true);
  assert.equal(network.requestId, undefined);
  assert.doesNotMatch(network.userMessage, /token|secret|fetch failed/);
});

test("status semantics normalize 401, 403, 409, 429, 500, and 503 without discarding safe domain copy", async () => {
  const cases = [
    [401,"AUTHENTICATION_REQUIRED","authentication",false],
    [403,"ADMIN_ACCESS_REQUIRED","authorization",false],
    [409,"NEW_CONFLICT","conflict",false],
    [429,"RATE_LIMIT_EXCEEDED","rate-limit",true],
    [500,"INTERNAL_SERVER_ERROR","server",true],
    [503,"SERVICE_UNAVAILABLE","server",true],
  ];
  for (const [status, code, kind, retryable] of cases) {
    const response = new Response(JSON.stringify({ error:{ code, message:`Safe domain message ${status}`, developerMessage:`Diagnostic ${status}`, requestId:`request-${status}` } }), { status, headers:{ "content-type":"application/json", ...(status === 429 ? { "retry-after":"3" } : {}) } });
    const error = await captureApiFailure(response);
    assert.equal(error.status, status);
    assert.equal(error.kind, kind);
    assert.equal(error.retryable, retryable);
    assert.equal(error.isBackendRejection, true);
    if (status === 409) assert.equal(error.userMessage, "Safe domain message 409");
    if (status === 429) assert.equal(error.retryAfterMs, 3000);
  }
});

test("production failures never log normalized diagnostics or sensitive transport data", async () => {
  const originalFetch = globalThis.fetch;
  const originalConsole = console.error;
  const originalEnvironment = process.env.NODE_ENV;
  const logs = [];
  process.env.NODE_ENV = "production";
  console.error = (...values) => logs.push(values);
  globalThis.fetch = async () => new Response(JSON.stringify({ error:{ code:"INTERNAL_SERVER_ERROR", message:"Please retry.", developerMessage:"Do not expose token=secret or passenger@example.com", requestId:"request-prod" } }), { status:500, headers:{ "content-type":"application/json" } });
  try { await assert.rejects(() => apiRequest("/api/v1/admin/test", { method:"POST", body:JSON.stringify({ token:"secret", passengerEmail:"passenger@example.com", answers:["private"] }) })); }
  finally { globalThis.fetch=originalFetch;console.error=originalConsole;process.env.NODE_ENV=originalEnvironment; }
  assert.deepEqual(logs, []);
});

test("copy and native share receive the complete backend link and report cancellation", async () => {
  const link = "https://feedback.example/feedback?token=opaque.value";
  let copied = "";
  await copyFeedbackLink(link, { writeText: async (value) => { copied = value; } });
  assert.equal(copied, link);
  let shared;
  assert.equal(await shareFeedbackLink(link, async (value) => { shared = value; }), "shared");
  assert.equal(shared.url, link);
  const cancellation = new Error("cancelled");
  cancellation.name = "AbortError";
  assert.equal(await shareFeedbackLink(link, async () => { throw cancellation; }), "cancelled");
});

test("booking phone validation requires canonical E.164 and recognizes backend field errors", () => {
  assert.equal(canonicalPassengerPhone("  +919876543210  "), "+919876543210");
  assert.equal(passengerPhoneError("+919876543210"), null);
  for (const invalid of ["", "9876543210", "+91 98765 43210", "+91-98765-43210", "+0123456789", "+1234567", "+1234567890123456"]) {
    assert.equal(passengerPhoneError(invalid), E164_ERROR);
  }
  assert.equal(backendPassengerPhoneError({ issues:[{ path:["body","passengerPhone"], message:"Phone must be E.164" }] }), "Phone must be E.164");
  assert.equal(backendPassengerPhoneError({ errors:{ passengerPhone:["Invalid passenger phone"] } }), "Invalid passenger phone");
});

test("booking creation accepts omitted metadata and trims supplied metadata", () => {
  const omitted = bookingMetadataFromForm(new FormData());
  assert.deepEqual(omitted, { tourName:null, fileNumber:null });

  const supplied = new FormData();
  supplied.set("tourName", "  Himalayan Explorer  ");
  supplied.set("fileNumber", "  FILE-204  ");
  assert.deepEqual(bookingMetadataFromForm(supplied), {
    tourName:"Himalayan Explorer",
    fileNumber:"FILE-204",
  });
  assert.equal(optionalText("   "), null);
});

test("booking metadata validation enforces contract limits", () => {
  assert.deepEqual(bookingMetadataErrors({
    tourName:"T".repeat(TOUR_NAME_MAX_LENGTH),
    fileNumber:"F".repeat(FILE_NUMBER_MAX_LENGTH),
  }), {});
  assert.deepEqual(bookingMetadataErrors({
    tourName:"T".repeat(TOUR_NAME_MAX_LENGTH + 1),
    fileNumber:"F".repeat(FILE_NUMBER_MAX_LENGTH + 1),
  }), {
    tourName:"Tour name must be 200 characters or fewer.",
    fileNumber:"File number must be 100 characters or fewer.",
  });
});

test("booking metadata updates can change one field and explicitly clear the other", () => {
  const edit = new FormData();
  edit.set("tourName", "  Updated tour  ");
  edit.set("fileNumber", "   ");
  const payload = bookingMetadataFromForm(edit);
  assert.deepEqual(payload, { tourName:"Updated tour", fileNumber:null });
  assert.equal(Object.hasOwn(payload, "fileNumber"), true);
  assert.match(JSON.stringify(payload), /"fileNumber":null/);

  const fileOnly = new FormData();
  fileOnly.set("tourName", "");
  fileOnly.set("fileNumber", "  FILE-205  ");
  assert.deepEqual(bookingMetadataFromForm(fileOnly), { tourName:null, fileNumber:"FILE-205" });
});

test("shared phone utilities normalize India and non-India input into exact E.164 payload values", () => {
  assert.equal(PHONE_COUNTRIES[0].iso, "IN");
  assert.equal(PHONE_COUNTRIES[0].callingCode, "91");
  assert.ok(PHONE_COUNTRIES.some((country) => country.iso === "US"));
  assert.equal(buildE164("91", "98765 43210"), "+919876543210");
  assert.equal(buildE164("1", "(415) 555-2671"), "+14155552671");
  assert.equal(buildE164("44", "20-7946-0958"), "+442079460958");
  assert.match(buildE164("91", "98765 43210"), E164_PATTERN);
  assert.match(buildE164("1", "(415) 555-2671"), E164_PATTERN);
  assert.equal(phoneError("9876543210"), E164_ERROR);
  assert.equal(phoneError("+14155552671"), null);
  assert.equal(JSON.stringify({ passengerPhone: buildE164("91", "98765-43210") }), '{"passengerPhone":"+919876543210"}');
});

test("every editable frontend phone field uses the shared country-aware input", () => {
  const sources = [
    ["admin-bookings.tsx", "passengerPhone"],
    ["admin-drivers.tsx", "phone"],
    ["profile-page.tsx", "phone"],
    ["admin-resources.tsx", "contactPhone"],
    ["passenger-flow.tsx", "respondentPhone"],
  ];
  for (const [file, name] of sources) {
    const source = readFileSync(new URL(`../components/${file}`, import.meta.url), "utf8");
    assert.match(source, new RegExp(`<PhoneInput name="${name}"`));
  }
  const shared = readFileSync(new URL("../components/phone-input.tsx", import.meta.url), "utf8");
  assert.match(shared, /name=\{`\$\{name\}Country`\}/);
  assert.match(shared, /<input type="hidden" name=\{name\} value=\{submittedValue\}/);
  assert.match(shared, /invalidLegacy \? PHONE_ERROR/);
});

test("optional phones preserve null while present values retain their leading plus", () => {
  assert.equal(optionalPhoneValue(""), null);
  assert.equal(optionalPhoneValue(null), null);
  assert.equal(optionalPhoneValue("+971501234567"), "+971501234567");
  const form = new FormData();
  form.set("phone", "");
  assert.equal(driverMutationFromForm(form, "AGENCY").phone, null);
  form.set("phone", "+14155552671");
  assert.equal(driverMutationFromForm(form, "AGENCY").phone, "+14155552671");
});

test("legacy phones are parsed only when an explicit international code is recoverable", () => {
  const formatted = parsePhoneValue("+91 (98765) 43210");
  assert.equal(formatted.country.iso, "IN");
  assert.equal(formatted.nationalNumber, "9876543210");
  assert.equal(formatted.canonical, "+919876543210");
  assert.equal(formatted.invalidLegacy, false);

  const unqualified = parsePhoneValue("98765 43210");
  assert.equal(unqualified.country.iso, "IN");
  assert.equal(unqualified.canonical, "98765 43210");
  assert.equal(unqualified.invalidLegacy, true);

  const malformed = parsePhoneValue("not-a-phone");
  assert.equal(malformed.canonical, "not-a-phone");
  assert.equal(malformed.invalidLegacy, true);
});

test("WhatsApp feedback message preserves exact link and line breaks and URL uses digits-only phone", () => {
  const link = "https://feedback.example/feedback?token=opaque.value&next=%2Fquestions";
  const message = buildWhatsAppFeedbackMessage("Asha Singh", link);
  assert.equal(message, `Hi Asha Singh,\n\nThank you for travelling with Eastern Risen. We would appreciate your feedback about your recent trip.\n\nShare your feedback here: ${link}`);
  const url = new URL(buildWhatsAppShareUrl("+91 98765-43210", message));
  assert.equal(url.origin + url.pathname, "https://wa.me/919876543210");
  assert.equal(url.searchParams.get("text"), message);
});

test("WhatsApp share opens before requesting, calls the admin endpoint once, and navigates the placeholder", async () => {
  const events = [];
  const placeholder = { closed:false, opener:{}, location:{ href:"" }, close(){ this.closed=true; } };
  const result = await openAdminFeedbackOnWhatsApp("engagement/one", {
    open:() => { events.push("open"); return placeholder; },
    request:async(path) => { events.push(`request:${path}`); return { data:{ engagementId:"engagement/one", feedbackLink:"https://feedback.example/feedback?token=opaque", feedbackAccessTokenExpiresAt:"2030-01-01T00:00:00Z", recipient:{ name:"Asha Singh", phone:"+919876543210" } } }; },
    navigate:() => assert.fail("current-page fallback should not run when the placeholder is open"),
  });
  assert.equal(result, "opened");
  assert.deepEqual(events, ["open", "request:/api/v1/admin/engagements/engagement%2Fone/feedback-link"]);
  assert.equal(placeholder.opener, null);
  assert.match(placeholder.location.href, /^https:\/\/wa\.me\/919876543210\?text=/);
});

test("WhatsApp share closes its placeholder on API failure or a missing recipient phone", async () => {
  const failedWindow = { closed:false, opener:{}, location:{ href:"" }, close(){ this.closed=true; } };
  await assert.rejects(() => openAdminFeedbackOnWhatsApp("trip-1", {
    open:() => failedWindow,
    request:async() => { throw new ApiError(503, "INTERNAL_SERVER_ERROR", "failed"); },
  }));
  assert.equal(failedWindow.closed, true);

  const missingWindow = { closed:false, opener:{}, location:{ href:"" }, close(){ this.closed=true; } };
  const missing = await openAdminFeedbackOnWhatsApp("engagement-1", {
    open:() => missingWindow,
    request:async() => ({ data:{ engagementId:"engagement-1", feedbackLink:"https://feedback.example/private", feedbackAccessTokenExpiresAt:"2030-01-01T00:00:00Z", recipient:{ name:"Legacy Passenger", phone:null } } }),
  });
  assert.equal(missing, "missing-phone");
  assert.equal(missingWindow.closed, true);
});

test("driver WhatsApp share uses the assigned-driver link and opens the recipient picker", async () => {
  const placeholder = { closed:false, opener:{}, location:{ href:"" }, close(){ this.closed=true; } };
  const result = await openFeedbackOnWhatsApp("engagement/driver", "driver", "Asha Singh", {
    open:() => placeholder,
    request:async(path) => {
      assert.equal(path, "/api/v1/driver/engagements/engagement%2Fdriver/feedback-link");
      return { data:{ engagementId:"engagement/driver", feedbackLink:"https://feedback.example/private", feedbackAccessTokenExpiresAt:"2030-01-01T00:00:00Z" } };
    },
  });
  const url = new URL(placeholder.location.href);
  assert.equal(result, "opened");
  assert.equal(url.origin + url.pathname, "https://wa.me/");
  assert.match(url.searchParams.get("text"), /^Hi Asha Singh,/);
  assert.match(url.searchParams.get("text"), /https:\/\/feedback\.example\/private$/);
});

test("booking UI collects, submits, edits, and displays passenger phone with a missing-phone edit path", () => {
  const bookings = readFileSync(new URL("../components/admin-bookings.tsx", import.meta.url), "utf8");
  const phoneInput = readFileSync(new URL("../components/phone-input.tsx", import.meta.url), "utf8");
  assert.match(bookings, /<PhoneInput name="passengerPhone" label="WhatsApp number"/);
  assert.match(phoneInput, /id=\{`\$\{name\}-national`\} type="tel"/);
  assert.match(bookings, /passengerPhone,startsAt,endsAt/);
  assert.match(bookings, /defaultValue=\{booking\?\.passengerPhone\|\|""\}/);
  assert.match(bookings, /passengerPhoneError\(passengerPhone\)/);
  assert.match(bookings, /booking\.passengerPhone\|\|"Missing"/);
  assert.match(bookings, /Legacy booking · <Link className="text-link" href=\{editHref\}>Add phone number/);
  assert.match(bookings, /ShareFeedbackOnWhatsAppAction engagementId=\{engagement\.id\} passengerPhone=\{passengerPhone\} editHref=\{editHref\}/);
});

test("booking metadata is typed, editable, submitted, listed, and rendered with missing values", () => {
  const bookings = readFileSync(new URL("../components/admin-bookings.tsx", import.meta.url), "utf8");
  const contracts = readFileSync(new URL("../lib/contracts.ts", import.meta.url), "utf8");
  assert.match(contracts, /bookingReference:string; tourName:string\|null; fileNumber:string\|null;/);
  assert.match(contracts, /bookingReference:string; tourName\?:string\|null; fileNumber\?:string\|null;/);
  assert.match(contracts, /"bookingReference"\|"tourName"\|"fileNumber"\|"passengerName"/);
  assert.match(bookings, /<Field name="tourName" label="Tour name" required=\{false\} maxLength=\{TOUR_NAME_MAX_LENGTH\} defaultValue=\{booking\?\.tourName\?\?""\} error=\{metadataError\.tourName\|\|backendFields\.tourName\}/);
  assert.match(bookings, /<Field name="fileNumber" label="File number" required=\{false\} maxLength=\{FILE_NUMBER_MAX_LENGTH\} defaultValue=\{booking\?\.fileNumber\?\?""\} error=\{metadataError\.fileNumber\|\|backendFields\.fileNumber\}/);
  assert.match(bookings, /const metadata=bookingMetadataFromForm\(data\)/);
  assert.match(bookings, /bookingReference:String\(data\.get\("bookingReference"\)\|\|""\)\.trim\(\),\.\.\.metadata,passengerName:/);
  assert.match(bookings, /booking\.tourName&&<small>Tour: \{booking\.tourName\}<\/small>/);
  assert.match(bookings, /<span>Tour name<\/span><strong>\{booking\.tourName\|\|"—"\}<\/strong>/);
  assert.match(bookings, /<span>File number<\/span><strong>\{booking\.fileNumber\|\|"—"\}<\/strong>/);
});

test("WhatsApp UI prevents duplicate requests, exposes standard errors, and never claims delivery", () => {
  const share = readFileSync(new URL("../components/share-feedback-link.tsx", import.meta.url), "utf8");
  assert.match(share, /if \(requestInFlight\.current \|\| missing\) return/);
  assert.match(share, /requestInFlight\.current = true/);
  assert.match(share, /disabled=\{missing \|\| loading\}/);
  assert.match(share, /<ErrorAlert \{\.\.\.error\} \/>/);
  assert.match(share, /WhatsApp opened\. Review the message, then press Send in WhatsApp\./);
  assert.match(share, /Share with <WhatsAppLogo \/>/);
  assert.doesNotMatch(share, /message (?:sent|delivered)|successfully (?:sent|delivered)/i);
});

test("share and passenger UI preserve exact links, bearer tokens, and non-persistent handling", () => {
  const share = readFileSync(new URL("../components/share-feedback-link.tsx", import.meta.url), "utf8");
  const passenger = readFileSync(new URL("../components/passenger-flow.tsx", import.meta.url), "utf8");
  const driver = readFileSync(new URL("../components/trip-card.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../components/admin-trips.tsx", import.meta.url), "utf8");
  assert.match(share, /copyFeedbackLink\(details\.feedbackLink, navigator\.clipboard\)/);
  assert.match(share, /shareFeedbackLink\(details\.feedbackLink, navigator\.share\.bind\(navigator\)\)/);
  assert.match(share, /result === "cancelled"/);
  assert.match(driver, /ShareFeedbackLinkAction engagementId=\{engagement\.id\} audience="driver"/);
  assert.match(driver, /setHandoff\(response\.data\.feedbackAccessToken,response\.data\.feedbackAccessTokenExpiresAt\);router\.push\("\/feedback"\)/);
  assert.doesNotMatch(admin, /ShareFeedback(?:Link|OnWhatsApp)Action/);
  const bookings = readFileSync(new URL("../components/admin-bookings.tsx", import.meta.url), "utf8");
  assert.match(bookings, /ShareFeedbackLinkAction engagementId=\{engagement\.id\} audience="admin"/);
  assert.match(passenger, /passengerTokenFromSearch\(window\.location\.search\)/);
  assert.match(passenger, /passengerToken:token/g);
  assert.match(passenger, /apiRequest<\{data:PassengerFeedbackStart\}>\("\/api\/v1\/passenger\/feedback\/start",\{method:"POST",passengerToken:token\}\)/);
  assert.match(passenger, /history\.replaceState\(null,"",`\$\{basePath\}\/feedback\/hand-back\/`\)/);
  assert.doesNotMatch(passenger, /localStorage|sessionStorage/);
  assert.match(passenger, /if\(sharedLink\)throw new ApiError/);
  assert.match(passenger, /if\(!sharedLink&&isRetryable\(cause\)\)await enqueue/);
});

test("engagement migration removes trip feedback calls and preserves conflict and retry safeguards", () => {
  const sources=["../components/admin-bookings.tsx","../components/admin-trips.tsx","../components/trip-card.tsx","../components/driver-home.tsx","../components/share-feedback-link.tsx","../components/passenger-flow.tsx","../lib/contracts.ts","../lib/offline-queue.ts"].map(path=>readFileSync(new URL(path,import.meta.url),"utf8")).join("\n");
  assert.doesNotMatch(sources,/\/(?:admin|driver)\/trips\/[^`"']+\/(?:feedback-link|start-feedback)/);
  assert.match(sources,/driver\/engagements\/\$\{encodeURIComponent\(engagement\.id\)\}\/start-feedback/);
  assert.match(sources,/context\.engagement\.trips/);
  assert.match(sources,/engagementId:string/);
  assert.match(sources,/ENGAGEMENT_FEEDBACK_ALREADY_SUBMITTED/);
  assert.match(sources,/submissionId\.current\?\?=crypto\.randomUUID\(\)/);
  assert.match(sources,/id:envelope\.clientSubmissionId/);
  assert.match(sources,/replayed: boolean/);
  assert.match(sources,/window\.addEventListener\("api-stale-state",refresh\)/);
  assert.match(sources,/invalidateTripMutationData/);
  assert.doesNotMatch(sources,/name="feedbackPurposes"/);
});

test("admin trip cards use engagement feedback state and do not render feedback chips", () => {
  const trips=readFileSync(new URL("../components/admin-trips.tsx",import.meta.url),"utf8");
  assert.match(trips,/getData<DriverEngagement>\(`\/api\/v1\/admin\/engagements\/\$\{encodeURIComponent\(id\)\}`\)/);
  assert.match(trips,/engagementStatus\?tripStatus\[engagementStatus\]/);
  assert.doesNotMatch(trips,/const state = tripStatus\[trip\.status\]/);
  assert.doesNotMatch(trips,/purposes=\{trip\.feedbackPurposes\}/);
  assert.doesNotMatch(trips,/aria-label="Filter trip status"/);
});

test("only READY admin engagements can edit feedback sections", () => {
  const bookings=readFileSync(new URL("../components/admin-bookings.tsx",import.meta.url),"utf8");
  const driver=readFileSync(new URL("../components/trip-card.tsx",import.meta.url),"utf8");
  const passenger=readFileSync(new URL("../components/passenger-flow.tsx",import.meta.url),"utf8");
  assert.match(bookings,/engagement\.status==="READY"&&<button type="button" className="button button-secondary" onClick=\{openSectionEditor\}>Edit feedback sections<\/button>/);
  assert.match(bookings,/admin\/engagements\/\$\{encodeURIComponent\(engagement\.id\)\}\/feedback-sections/);
  assert.match(bookings,/JSON\.stringify\(\{feedbackPurposes:selectedSections\}\)/);
  assert.match(bookings,/selectedSections\.length<1\|\|selectedSections\.length>3/);
  assert.match(bookings,/ENGAGEMENT_FEEDBACK_SECTIONS_NOT_EDITABLE/);
  assert.match(bookings,/resources\?\.includes\("trips"\)/);
  assert.match(bookings,/invalidateEngagementFeedbackData\(\[engagement\.booking\.id\]\)/);
  assert.doesNotMatch(driver,/Edit feedback sections|feedback-sections/);
  assert.doesNotMatch(passenger,/Edit feedback sections|admin\/engagements/);
});

test("active driver journeys, searchable booking selection, and source-aware completion remain visible", () => {
  const journeys = readFileSync(new URL("../components/driver-home.tsx", import.meta.url), "utf8");
  const trips = readFileSync(new URL("../components/admin-trips.tsx", import.meta.url), "utf8");
  const passenger = readFileSync(new URL("../components/passenger-flow.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(journeys, /status:"READY"/);
  assert.match(journeys, /status:"FEEDBACK_STARTED"/);
  assert.doesNotMatch(journeys, /status:"SUBMITTED"/);
  assert.match(trips, /<Combobox id="bookingId" name="bookingId" label="Booking" options=\{bookingOptions\}/);
  assert.match(passenger, /linkToken\)return\{token:linkToken,sharedLink:true\}/);
  assert.match(passenger, /\{!sharedLink&&<><div className="handback">/);
  assert.match(styles, /\.select \{ appearance:none; padding-right:2\.8rem;/);
  assert.match(styles, /background-position:right \.95rem center/);
});

test("trip range formatting does not crash on an invalid passenger-context schedule", () => {
  assert.equal(formatTripRange("", "2030-01-01T11:00:00.000Z"), "Schedule unavailable");
  assert.equal(formatTripRange(null, "2030-01-01T11:00:00.000Z"), "Schedule unavailable");
  assert.equal(formatTripRange("2030-01-01T10:00:00.000Z", "not-a-date"), "Schedule unavailable");
  assert.equal(formatTripRange("2030-01-01T11:00:00.000Z", "2030-01-01T10:00:00.000Z"), "Schedule unavailable");
  assert.doesNotThrow(() => formatTripRange(
    "2030-01-01T10:00:00.000Z",
    "2030-01-01T11:00:00.000Z",
    "Invalid/Timezone",
  ));
});

test("star ratings visually highlight the selected star and every preceding star", () => {
  const passenger = readFileSync(new URL("../components/passenger-flow.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(passenger, /data-highlighted=\{typeof value==="number"&&score<=value\}/);
  assert.match(styles, /\.rating button\[data-highlighted="true"\]/);
});

test("frontend deployment uses static pages and query-based record routes", () => {
  const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
  const workflow = readFileSync(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");
  const detailRoutes = readFileSync(new URL("../components/query-detail-routes.tsx", import.meta.url), "utf8");
  const navigationSources = [
    "../components/admin-drivers.tsx",
    "../components/admin-feedback-list.tsx",
    "../components/questionnaires.tsx",
    "../components/trip-card.tsx",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n");

  assert.match(nextConfig, /output:\s*"export"/);
  assert.match(nextConfig, /basePath/);
  assert.match(workflow, /npm run build:static/);
  for (const parameter of ["driverId", "feedbackId", "questionnaireId", "engagementId"]) {
    assert.match(detailRoutes, new RegExp(`useRequiredParameter\\("${parameter}"\\)`));
    assert.match(navigationSources, new RegExp(`${parameter}=`));
  }
  for (const dynamicPage of [
    "../app/admin/drivers/[driverId]/page.tsx",
    "../app/admin/feedback/[feedbackId]/page.tsx",
    "../app/admin/questionnaires/[questionnaireId]/page.tsx",
    "../app/driver/trips/[tripId]/page.tsx",
  ]) {
    assert.equal(existsSync(new URL(dynamicPage, import.meta.url)), false);
  }
});

test("only transport, server, and rate-limit failures are retryable", () => {
  assert.equal(canRetry(0, "transport"), true);
  assert.equal(canRetry(503, "server"), true);
  assert.equal(canRetry(429, "rate-limit"), true);
  for (const [status, kind] of [[400,"validation"],[401,"authentication"],[403,"authorization"],[404,"not-found"],[409,"conflict"],[413,"protocol"],[415,"protocol"]]) {
    assert.equal(canRetry(status, kind), false, `${status} must not queue`);
  }
});

test("retry backoff is bounded", () => {
  assert.equal(backoffDelay(0), 2_000);
  assert.equal(backoffDelay(1), 4_000);
  assert.equal(backoffDelay(8), 300_000);
  assert.equal(backoffDelay(40), 300_000);
});

const futureTrip = {
  bookingId:"booking-1", pickupLocation:"Airport", destination:"Hotel",
  scheduledAt:"2030-01-01T10:00:00.000Z", scheduledEndAt:"2030-01-01T11:00:00.000Z", vehicleId:"vehicle-1", driverId:"driver-1",
};

test("trip schedule validation rejects past starts, reversed ranges, and normalized duplicate locations", () => {
  assert.equal(validateTripSchedule(futureTrip, new Date("2029-01-01")).scheduledAt, undefined);
  assert.match(validateTripSchedule({ ...futureTrip, scheduledAt:"2028-01-01T10:00:00.000Z" }, new Date("2029-01-01")).scheduledAt, /future/);
  assert.match(validateTripSchedule({ ...futureTrip, scheduledEndAt:futureTrip.scheduledAt }, new Date("2029-01-01")).scheduledEndAt, /after/);
  const duplicate = validateTripSchedule({ ...futureTrip, pickupLocation:"  Main   Street ", destination:"main street" }, new Date("2029-01-01"));
  assert.ok(duplicate.pickupLocation && duplicate.destination);
  assert.equal(normalizeLocation("  Main   Street "), "main street");
});

test("editing an unrelated trip field preserves scheduledEndAt", () => {
  const patch = changedTripFields({ ...futureTrip, booking:{id:"booking-1"}, vehicle:{id:"vehicle-1"}, driver:{id:"driver-1"} }, { ...futureTrip, destination:"Station" });
  assert.deepEqual(patch, { destination:"Station" });
});

test("all assignment errors have actionable messages and relevant fields", () => {
  const expected = {
    TRIP_CANNOT_BE_SCHEDULED_IN_PAST:"The trip must be scheduled in the future.",
    INVALID_TRIP_SCHEDULE:"The trip end time must be after the start time.",
    TRIP_LOCATIONS_MUST_DIFFER:"Pickup and destination must be different.",
    ACTIVE_BOOKING_NOT_FOUND:"Choose an active booking for this trip.",
    TRIP_OUTSIDE_BOOKING_PERIOD:"The trip must start and end within the booking period.",
    DRIVER_NOT_AVAILABLE_FOR_ASSIGNMENT:"The selected driver is currently unavailable for assignment.",
    DRIVER_SCHEDULE_CONFLICT:"The selected driver already has another trip during this time.",
    VEHICLE_SCHEDULE_CONFLICT:"The selected vehicle already has another trip during this time.",
    DRIVER_ON_LEAVE:"The selected driver is on leave during this time.",
    TRIP_OUTSIDE_DRIVER_SHIFT:"This trip falls outside the selected driver’s configured shift.",
    DRIVER_DAILY_DUTY_LIMIT_EXCEEDED:"This trip would exceed the driver’s daily duty limit.",
  };
  for (const [code,message] of Object.entries(expected)) {
    assert.equal(errorMessage(new ApiError(code.includes("CONFLICT") ? 409 : 400, code, "backend")), message);
    assert.ok(assignmentErrorFields[code]?.length, `${code} should highlight fields`);
  }
});

test("driver assignment settings serialize exact duty minutes and clear both shift fields", () => {
  const data = new FormData();
  data.set("assignmentEnabled","on"); data.set("timeZone","Asia/Kolkata"); data.set("dutyHours","12"); data.set("dutyMinutes","30");
  assert.deepEqual(assignmentSettingsFromForm(data), {
    assignmentEnabled:true, shiftStartTime:null, shiftEndTime:null, timeZone:"Asia/Kolkata", maxDailyDutyMinutes:750,
  });
  assert.equal(dutyMinutes("23","59"),1439);
});

test("driver assignment validation accepts overnight shifts", () => {
  assert.equal(validateAssignmentSettings({
    assignmentEnabled:true, shiftStartTime:"22:00", shiftEndTime:"06:00", timeZone:"Asia/Kolkata", maxDailyDutyMinutes:720,
  }),null);
  assert.match(validateAssignmentSettings({
    assignmentEnabled:true, shiftStartTime:"09:00", shiftEndTime:null, timeZone:"Asia/Kolkata", maxDailyDutyMinutes:720,
  }),/both/);
});

test("driver license dates remain optional and expiry must follow issue date", () => {
  const empty = new FormData();
  assert.equal(validateDriverLicense(empty), null);
  const invalid = new FormData();
  invalid.set("licenseIssuedOn", "2030-06-01");
  invalid.set("licenseExpiresOn", "2030-06-01");
  assert.match(validateDriverLicense(invalid), /after/);
  invalid.set("licenseExpiresOn", "2031-06-01");
  assert.equal(validateDriverLicense(invalid), null);
});

test("paginated responses are parsed and malformed legacy list envelopes are rejected", () => {
  const response = parsePaginatedResponse({
    data: [{ id:"questionnaire-1" }],
    pagination: { page:2, pageSize:25, total:51 },
  });
  assert.equal(response.data[0].id, "questionnaire-1");
  assert.deepEqual(response.pagination, { page:2, pageSize:25, total:51 });
  assert.throws(() => parsePaginatedResponse({ data: [] }), /Invalid paginated response/);
  assert.throws(() => parsePaginatedResponse({ data: [], pagination:{ page:0, pageSize:25, total:0 } }), /Invalid paginated response/);
});

test("pagination calculates totals and enforces next and previous boundaries", () => {
  assert.equal(totalPages(0, 25), 0);
  assert.equal(totalPages(1, 25), 1);
  assert.equal(totalPages(51, 25), 3);
  assert.equal(boundedPage(0, 51, 25), 1);
  assert.equal(boundedPage(4, 51, 25), 3);
  assert.equal(boundedPage(2, 0, 25), 1);
});

test("filter and page-size changes reset page one while retaining other list filters", () => {
  const filtered = updateListSearch("?page=4&pageSize=25&status=READY&driverId=d-1", { status:"ARCHIVED" }, true);
  assert.equal(filtered.get("page"), "1");
  assert.equal(filtered.get("pageSize"), "25");
  assert.equal(filtered.get("status"), "ARCHIVED");
  assert.equal(filtered.get("driverId"), "d-1");
  const resized = updateListSearch(filtered.toString(), { pageSize:50 }, true);
  assert.equal(resized.get("page"), "1");
  assert.equal(resized.get("pageSize"), "50");
});

test("removing the final item on a page returns to the preceding valid page", () => {
  assert.equal(pageAfterRemovingLastItem(3, 1), 2);
  assert.equal(pageAfterRemovingLastItem(3, 2), 3);
  assert.equal(pageAfterRemovingLastItem(1, 1), 1);
});

test("combobox filtering matches labels, descriptions, and alternate keywords", () => {
  const options = [
    { value:"d-1", label:"Asha Singh", description:"DRV-104 · Agency driver" },
    { value:"d-2", label:"Ravi Kumar", description:"DRV-205 · Mountain Travel", keywords:"outsourced" },
  ];
  assert.deepEqual(filterComboboxOptions(options, "asha").map((option) => option.value), ["d-1"]);
  assert.deepEqual(filterComboboxOptions(options, "DRV-205").map((option) => option.value), ["d-2"]);
  assert.deepEqual(filterComboboxOptions(options, "outsourced").map((option) => option.value), ["d-2"]);
  assert.equal(filterComboboxOptions(options, "missing").length, 0);
});

test("questionnaires, questionnaire versions, and driver leaves use paginated list clients", () => {
  const questionnaires = readFileSync(new URL("../components/questionnaires.tsx", import.meta.url), "utf8");
  const drivers = readFileSync(new URL("../components/admin-drivers.tsx", import.meta.url), "utf8");
  assert.match(questionnaires, /admin\/questionnaires\?\$\{listQuery\(\{ page: search\.page, pageSize: search\.pageSize \}\)\}/);
  assert.match(questionnaires, /questionnaires\/\$\{questionnaireId\}\/versions\?\$\{listQuery\(\{ page, pageSize \}\)\}/);
  assert.match(drivers, /drivers\/\$\{driver\.id\}\/leaves\?\$\{listQuery\(\{ page, pageSize \}\)\}/);
  assert.doesNotMatch(questionnaires, /DataResponse<Questionnaire/);
  assert.doesNotMatch(drivers, /DataResponse<DriverLeave/);
});

test("list mutations refetch and item-removing mutations apply empty-last-page fallback", () => {
  for (const relativePath of ["../components/admin-resources.tsx", "../components/admin-drivers.tsx", "../components/admin-trips.tsx"]) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    assert.match(source, /pageAfterRemovingLastItem/);
    assert.match(source, /list\.refetch\(\)/);
  }
  const questionnaires = readFileSync(new URL("../components/questionnaires.tsx", import.meta.url), "utf8");
  assert.match(questionnaires, /await list\.refetch\(\)/);
});

test("new aggregate and feedback filters serialize exactly and omit unset values", () => {
  assert.equal(contractSearch({ month:"2026-07", negativeOnly:true, page:2, pageSize:25, driverId:"" }), "month=2026-07&negativeOnly=true&page=2&pageSize=25");
  assert.equal(adminFeedbackPath({ month:"2026-07", driverSource:"OUTSOURCED", category:"CLEANLINESS", minimumScore:1.5, maximumScore:4, negativeOnly:false, page:3, pageSize:50 }), "/api/v1/admin/feedback?month=2026-07&driverSource=OUTSOURCED&category=CLEANLINESS&minimumScore=1.5&maximumScore=4&negativeOnly=false&page=3&pageSize=50");
  assert.equal(adminAnalyticsPath({ month:"2026-07", vendorId:"vendor-id" }), "/api/v1/admin/analytics?month=2026-07&vendorId=vendor-id");
  assert.equal(driverPerformancePath("2026-07"), "/api/v1/driver/performance?month=2026-07");
  assert.equal(driverPerformancePath(), "/api/v1/driver/performance");
  assert.equal(validMonth("2026-07"), true);
  assert.equal(validMonth("2026-7"), false);
});

test("nullable averages and counts remain explicit", () => {
  assert.equal(scoreLabel(null), "No scored feedback");
  assert.equal(scoreLabel(4.125), "4.13");
  assert.equal(countLabel(0, 0), "0 responses · 0 scored answers");
  assert.equal(countLabel(1, 2), "1 response · 2 scored answers");
});

test("settings, review, analytics, performance, and completion sources preserve contract boundaries", () => {
  const settings=readFileSync(new URL("../components/admin-settings.tsx",import.meta.url),"utf8");
  const list=readFileSync(new URL("../components/admin-feedback-list.tsx",import.meta.url),"utf8");
  const detail=readFileSync(new URL("../components/admin-feedback-detail.tsx",import.meta.url),"utf8");
  const analytics=readFileSync(new URL("../components/admin-analytics.tsx",import.meta.url),"utf8");
  const performance=readFileSync(new URL("../components/driver-performance.tsx",import.meta.url),"utf8");
  const passenger=readFileSync(new URL("../components/passenger-flow.tsx",import.meta.url),"utf8");
  assert.match(settings,/method:"PATCH"/);
  assert.match(settings,/draft\.negativeFeedbackThreshold!==original\.negativeFeedbackThreshold/);
  assert.match(settings,/TIMEZONE_INVALID/);
  assert.doesNotMatch(list,/respondent\\.(phone|email)/);
  assert.match(detail,/FEEDBACK_ARCHIVE_REASON_REQUIRED/);
  assert.doesNotMatch(detail,/Restore/);
  assert.match(analytics,/negativeFeedbackThreshold===null/);
  assert.match(analytics,/accessible data table/);
  for(const forbidden of ["data.respondentName","data.bookingReference","data.comments","data.reviewHistory","data.feedbackId"]) assert.doesNotMatch(performance,new RegExp(forbidden.replace(".","\\.")));
  assert.match(passenger,/completion\?\.thankYouMessage/);
  assert.match(passenger,/context\.completion\.timezone/);
});

test("profile changes include only editable fields that actually changed", () => {
  const original = { displayName:"Synthetic Driver", email:"driver@example.test", phone:null };
  const draft = { displayName:"Synthetic Driver", email:"new@example.test", phone:null };
  assert.deepEqual(changedProfileFields(original, draft, ["displayName","email","phone"]), { email:"new@example.test" });
  assert.equal(passwordValidation("short", "short"), "Use between 12 and 128 characters.");
  assert.equal(passwordValidation("synthetic-password-1", "synthetic-password-2"), "The new passwords do not match.");
  assert.equal(passwordValidation("synthetic-password-1", "synthetic-password-1"), null);
});

test("all profile and direct-reset endpoints use the central client, session credentials, and bodyless 204 responses", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const profile = { accountId:"account-1", role:"ADMIN", displayName:"Synthetic Admin", email:"admin@example.test", status:"ACTIVE", passwordChangedAt:"2026-01-01T00:00:00Z", lastLoginAt:null, createdAt:"2026-01-01T00:00:00Z", updatedAt:"2026-01-01T00:00:00Z" };
  const driver = { ...profile, role:"DRIVER", driverId:"driver-1", driverCode:"DRV-1", phone:null, sourceType:"AGENCY", vendorId:null, vendorName:null, assignmentEnabled:true, shiftStartTime:null, shiftEndTime:null, timeZone:"Asia/Kolkata", maxDailyDutyMinutes:720 };
  globalThis.fetch = async (url, init) => {
    calls.push({ url:String(url), init });
    if (String(url).endsWith("/change-password") || String(url).endsWith("/password-reset")) return new Response(null, { status:204 });
    if (String(url).includes("/admin/drivers/")) return Response.json({ data:{ ...driver, id:"driver-1", archivedAt:null } });
    return Response.json({ data:String(url).includes("/driver/profile") ? driver : profile });
  };
  try {
    await getAdminProfile();
    await updateAdminProfile({ displayName:"Synthetic Admin Two" });
    await changePassword("admin", { currentPassword:"synthetic-current", newPassword:"synthetic-new-password" });
    await getDriverProfile();
    await updateDriverProfile({ phone:null });
    await changePassword("driver", { currentPassword:"synthetic-current", newPassword:"synthetic-new-password" });
    await getAdminDriver("driver-1");
    await resetAdminDriverPassword("driver-1", { newPassword:"synthetic-new-password" });
    assert.equal(calls.length, 8);
    assert.ok(calls.every((call) => call.init.credentials === "include"));
    assert.deepEqual(calls.map((call) => new URL(call.url).pathname), [
      accountPaths.profile("admin"), accountPaths.profile("admin"), accountPaths.changePassword("admin"),
      accountPaths.profile("driver"), accountPaths.profile("driver"), accountPaths.changePassword("driver"),
      accountPaths.driverDetail("driver-1"), accountPaths.adminDriverReset("driver-1"),
    ]);
    assert.equal(calls[7].init.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[7].init.body)), { newPassword:"synthetic-new-password" });
  } finally { globalThis.fetch = originalFetch; }
});

test("password and direct-reset UI keeps secrets out of persistence, URLs, logs, telemetry, and mutation metadata", () => {
  const source = readFileSync(new URL("../components/admin-driver-detail.tsx", import.meta.url), "utf8");
  const accountApi = readFileSync(new URL("../lib/account-api.ts", import.meta.url), "utf8");
  for (const forbidden of ["localStorage","sessionStorage","indexedDB","URLSearchParams","history.","console.","analytics","queryKey"]) {
    assert.doesNotMatch(`${source}\n${accountApi}`, new RegExp(forbidden.replace(".","\\.")));
  }
  assert.match(accountApi, /body: JSON\.stringify\(body\)/);
  assert.doesNotMatch(accountApi, /metadata|toast|cache/);
});

test("driver profile operational information is rendered without matching form controls", () => {
  const source = readFileSync(new URL("../components/profile-page.tsx", import.meta.url), "utf8");
  for (const field of ["driverCode","sourceType","assignmentEnabled","shiftStartTime","timeZone","maxDailyDutyMinutes"]) {
    assert.match(source, new RegExp(`profile\\.${field}`));
    assert.doesNotMatch(source, new RegExp(`name="${field}"`));
  }
});

test("direct reset identifies its target, is unavailable when archived, and makes no email claim", () => {
  const adminSource = readFileSync(new URL("../components/admin-driver-detail.tsx", import.meta.url), "utf8");
  assert.match(adminSource, /driver\.status !== "ARCHIVED"/);
  assert.match(adminSource, /Reset driver password/);
  assert.match(adminSource, /Driver ID/);
  assert.match(adminSource, /All of this driver’s signed-in sessions will end immediately/);
  assert.match(adminSource, /Password reset\. The driver must sign in with the new password\./);
  assert.doesNotMatch(adminSource, /Email sent|queued for delivery|reset instructions/i);
  assert.equal(existsSync(new URL("../app/(auth)/driver/forgot-password/page.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../app/(auth)/reset-password/page.tsx", import.meta.url)), false);
});
