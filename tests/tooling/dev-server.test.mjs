import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { WebSocket } from "ws";
import { createReloadServer } from "../../scripts/dev-server.mjs";

test("local reload helper authenticates extensions and sends build IDs only", async () => {
  const token = randomBytes(32).toString("hex");
  const server = await createReloadServer({ port: 0, token });
  const endpoint = `ws://127.0.0.1:${server.port}/reload?token=${token}`;
  try {
    const rejected = async (url, origin) => {
      const socket = new WebSocket(url, { origin });
      const [error] = await once(socket, "error");
      assert.match(error.message, /403/);
    };
    await rejected(endpoint, "https://www.roblox.com");
    await rejected(
      endpoint.replace(token, "wrong"),
      `chrome-extension://${"a".repeat(32)}`,
    );
    await rejected(
      endpoint.replace("/reload?", "/anything?"),
      `chrome-extension://${"a".repeat(32)}`,
    );
    const first = randomUUID();
    server.publish(first);
    const socket = new WebSocket(endpoint, {
      origin: `chrome-extension://${"a".repeat(32)}`,
    });
    const [initial] = await once(socket, "message");
    assert.deepEqual(JSON.parse(String(initial)), {
      type: "build",
      revision: first,
    });
    const message = once(socket, "message");
    const next = randomUUID();
    server.publish(next);
    assert.deepEqual(JSON.parse(String((await message)[0])), {
      type: "build",
      revision: next,
    });
    assert.throws(
      () => server.publish("https://outside.invalid/code.js"),
      /Invalid build ID/,
    );
    const response = await fetch(
      `http://127.0.0.1:${server.port}/background.js`,
    );
    assert.equal(response.status, 404);
    socket.terminate();
  } finally {
    await server.close();
  }
});
