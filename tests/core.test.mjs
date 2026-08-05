import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { backoffDelay, canRetry } from "../lib/retry-policy.ts";
import { assignmentErrorFields, changedTripFields, normalizeLocation, validateTripSchedule } from "../lib/trip-scheduling.ts";
import { ApiError, apiRequest, errorMessage } from "../lib/api.ts";
import { assignmentSettingsFromForm, dutyMinutes, validateAssignmentSettings, validateDriverLicense } from "../lib/driver-scheduling.ts";
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

test("feedback-link endpoints preserve admin and assigned-driver authorization boundaries", () => {
  assert.equal(feedbackLinkPath("admin", "trip/one"), "/api/v1/admin/trips/trip%2Fone/feedback-link");
  assert.equal(feedbackLinkPath("driver", "trip/one"), "/api/v1/driver/trips/trip%2Fone/feedback-link");
  assert.equal(errorMessage(new ApiError(404, "TRIP_NOT_FOUND", "backend")), "This trip is unavailable or is not assigned to you.");
});

test("handoff uses the complete backend feedback link and formats expiry locally", () => {
  const data = feedbackLinkFromHandoff({
    id: "trip-1",
    feedbackLink: "https://feedback.example/feedback?token=opaque.value",
    feedbackAccessTokenExpiresAt: "2030-01-02T03:04:00.000Z",
  });
  assert.deepEqual(data, {
    tripId: "trip-1",
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

test("share and passenger UI preserve exact links, bearer tokens, and non-persistent handling", () => {
  const share = readFileSync(new URL("../components/share-feedback-link.tsx", import.meta.url), "utf8");
  const passenger = readFileSync(new URL("../components/passenger-flow.tsx", import.meta.url), "utf8");
  const driver = readFileSync(new URL("../components/trip-card.tsx", import.meta.url), "utf8");
  const admin = readFileSync(new URL("../components/admin-trips.tsx", import.meta.url), "utf8");
  assert.match(share, /copyFeedbackLink\(details\.feedbackLink, navigator\.clipboard\)/);
  assert.match(share, /shareFeedbackLink\(details\.feedbackLink, navigator\.share\.bind\(navigator\)\)/);
  assert.match(share, /result === "cancelled"/);
  assert.match(driver, /trip\.status==="READY"\|\|trip\.status==="FEEDBACK_STARTED"\)\&\&<ShareFeedbackLinkAction tripId=\{trip\.id\} audience="driver"/);
  assert.match(driver, /setHandoff\(response\.data\.feedbackAccessToken,response\.data\.feedbackAccessTokenExpiresAt\);router\.push\("\/feedback"\)/);
  assert.match(admin, /trip\.status === "READY" \|\| trip\.status === "FEEDBACK_STARTED"\) && <ShareFeedbackLinkAction tripId=\{trip\.id\} audience="admin"/);
  assert.match(passenger, /passengerTokenFromSearch\(window\.location\.search\)/);
  assert.match(passenger, /passengerToken:token/g);
  assert.match(passenger, /apiRequest<\{data:PassengerFeedbackStart\}>\("\/api\/v1\/passenger\/feedback\/start",\{method:"POST",passengerToken:token\}\)/);
  assert.match(passenger, /history\.replaceState\(null,"",`\$\{basePath\}\/feedback\/hand-back\/`\)/);
  assert.doesNotMatch(passenger, /localStorage|sessionStorage/);
  assert.match(passenger, /if\(sharedLink\)throw new ApiError/);
  assert.match(passenger, /if\(!sharedLink&&isRetryable\(cause\)\)await enqueue/);
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
  for (const parameter of ["driverId", "feedbackId", "questionnaireId", "tripId"]) {
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
