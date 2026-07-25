import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { backoffDelay, canRetry } from "../lib/retry-policy.ts";
import { assignmentErrorFields, changedTripFields, normalizeLocation, validateTripSchedule } from "../lib/trip-scheduling.ts";
import { ApiError, errorMessage } from "../lib/api.ts";
import { assignmentSettingsFromForm, dutyMinutes, validateAssignmentSettings } from "../lib/driver-scheduling.ts";
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
  bookingReference:"BK-1", passengerName:"Passenger", pickupLocation:"Airport", destination:"Hotel",
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
  const patch = changedTripFields({ ...futureTrip, vehicle:{id:"vehicle-1"}, driver:{id:"driver-1"} }, { ...futureTrip, passengerName:"Updated" });
  assert.deepEqual(patch, { passengerName:"Updated" });
});

test("all assignment errors have actionable messages and relevant fields", () => {
  const expected = {
    TRIP_CANNOT_BE_SCHEDULED_IN_PAST:"The trip must be scheduled in the future.",
    INVALID_TRIP_SCHEDULE:"The trip end time must be after the start time.",
    TRIP_LOCATIONS_MUST_DIFFER:"Pickup and destination must be different.",
    TRIP_BOOKING_REFERENCE_ALREADY_EXISTS:"This booking reference is already in use.",
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
