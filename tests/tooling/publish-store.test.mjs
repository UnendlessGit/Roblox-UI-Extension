import { test } from "node:test";
import assert from "node:assert/strict";
import { publishStore } from "../../scripts/publish-store.mjs";
const env = {
  CWS_PUBLISHER_ID: "test-publisher",
  CWS_EXTENSION_ID: "a".repeat(32),
  CWS_CLIENT_ID: "test-client",
  CWS_CLIENT_SECRET: "private-test-client",
  CWS_REFRESH_TOKEN: "private-test-refresh",
};
const input = {
  env,
  version: "0.6.0",
  packageBytes: Buffer.from("test-zip"),
  wait: async () => {},
};
function mock(responses) {
  const calls = [];
  return {
    calls,
    fetcher: async (url, options) => {
      calls.push({ url, options });
      const next = responses.shift();
      assert.ok(next, "unexpected request");
      return new Response(JSON.stringify(next.body ?? next), {
        status: next.status || 200,
      });
    },
  };
}
test("store publication waits for upload success, then submits a normal reviewed release", async () => {
  const api = mock([
    { access_token: "test-access" },
    {},
    { uploadState: "IN_PROGRESS" },
    { lastAsyncUploadState: "SUCCEEDED" },
    { state: "PENDING_REVIEW" },
  ]);
  assert.match(await publishStore({ ...input, ...api }), /PENDING_REVIEW/);
  assert.equal(api.calls.length, 5);
  assert.deepEqual(JSON.parse(api.calls.at(-1).options.body), {
    publishType: "DEFAULT_PUBLISH",
    blockOnWarnings: true,
  });
  assert.ok(api.calls.every((call) => call.options.redirect === "error"));
  assert.equal(api.calls[2].options.body, input.packageBytes);
});
test("already-published versions skip uploads, including older main commits", async () => {
  const api = mock([
    { access_token: "test-access" },
    {
      publishedItemRevisionStatus: {
        distributionChannels: [{ crxVersion: "0.6.1" }],
      },
    },
  ]);
  assert.match(await publishStore({ ...input, ...api }), /already published/);
  assert.equal(api.calls.length, 2);
});
test("an existing same-version review is not uploaded again", async () => {
  const api = mock([
    { access_token: "test-access" },
    {
      submittedItemRevisionStatus: {
        state: "PENDING_REVIEW",
        distributionChannels: [{ crxVersion: "0.6.0" }],
      },
    },
  ]);
  assert.match(await publishStore({ ...input, ...api }), /already submitted/);
  assert.equal(api.calls.length, 2);
});
test("upload failures never publish", async () => {
  const api = mock([
    { access_token: "test-access" },
    {},
    { uploadState: "FAILED" },
  ]);
  await assert.rejects(
    publishStore({ ...input, ...api }),
    /No publish request/,
  );
  assert.equal(api.calls.length, 3);
});
test("missing credentials do not request anything and error responses cannot expose secrets", async () => {
  const noRequests = mock([]);
  await assert.rejects(
    publishStore({ ...input, ...noRequests, env: {} }),
    /Missing Chrome/,
  );
  assert.equal(noRequests.calls.length, 0);
  const failure = mock([
    { status: 401, body: { error: env.CWS_CLIENT_SECRET } },
  ]);
  await assert.rejects(
    publishStore({ ...input, ...failure }),
    (error) =>
      !error.message.includes(env.CWS_CLIENT_SECRET) &&
      /HTTP 401/.test(error.message),
  );
});
