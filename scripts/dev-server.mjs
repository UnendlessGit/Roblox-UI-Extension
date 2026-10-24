import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

export async function createReloadServer({ port, token }) {
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("Invalid development session");
  let revision;
  const server = createServer((_request, response) => {
    response.writeHead(404, {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
    });
    response.end("Roblox Cinema development helper. No files are served here.");
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  server.on("upgrade", (request, socket, head) => {
    let url;
    try {
      url = new URL(request.url || "/", "http://127.0.0.1");
    } catch {
      socket.destroy();
      return;
    }
    if (
      request.headers.host !== `127.0.0.1:${server.address().port}` ||
      !/^chrome-extension:\/\/[a-p]{32}$/.test(request.headers.origin || "") ||
      url.pathname !== "/reload" ||
      url.searchParams.get("token") !== token
    ) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    sockets.handleUpgrade(request, socket, head, (connection) => {
      connection.on("error", () => {});
      if (revision)
        connection.send(JSON.stringify({ type: "build", revision }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const send = (message) => {
    for (const socket of sockets.clients)
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(message));
  };
  const heartbeat = setInterval(() => send({ type: "ping" }), 20000);
  heartbeat.unref();
  return {
    port: server.address().port,
    connections: () => sockets.clients.size,
    publish(next) {
      if (!/^[a-f0-9-]{36}$/.test(next)) throw new Error("Invalid build ID");
      revision = next;
      send({ type: "build", revision });
    },
    close: async () => {
      clearInterval(heartbeat);
      for (const socket of sockets.clients) socket.terminate();
      sockets.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
