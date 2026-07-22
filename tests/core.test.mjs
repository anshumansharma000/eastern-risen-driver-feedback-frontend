import test from "node:test";
import assert from "node:assert/strict";
import { backoffDelay, canRetry } from "../lib/retry-policy.ts";

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
