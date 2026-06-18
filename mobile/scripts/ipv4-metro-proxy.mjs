#!/usr/bin/env node
/**
 * Metro on this machine often binds [::1]:8081 only; Expo Go requests 127.0.0.1:8081.
 * Run alongside `expo start` to forward IPv4 loopback → IPv6 loopback.
 */
import net from "node:net";

const listenHost = "127.0.0.1";
const listenPort = 8081;
const upstreamHost = "::1";
const upstreamPort = 8081;

const server = net.createServer((client) => {
  const upstream = net.connect({ host: upstreamHost, port: upstreamPort });
  client.pipe(upstream);
  upstream.pipe(client);
  client.on("error", () => upstream.destroy());
  upstream.on("error", () => client.destroy());
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`${listenHost}:${listenPort} already in use (proxy may already be running)`);
    process.exit(0);
  }
  console.error(err.message);
  process.exit(1);
});

server.listen(listenPort, listenHost, () => {
  console.log(`IPv4 proxy ${listenHost}:${listenPort} -> [${upstreamHost}]:${upstreamPort}`);
});

setInterval(() => {}, 1 << 30);
