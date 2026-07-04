import http from "node:http";
import { syncBuiltinESMExports } from "node:module";

let requestHandler;
const originalCreateServer = http.createServer;

http.createServer = function createServerForVercel(handler) {
  requestHandler = handler;
  return {
    listen() {
      return this;
    },
    on() {
      return this;
    },
    close(callback) {
      if (callback) callback();
      return this;
    },
  };
};

syncBuiltinESMExports();
await import("../server.js");
http.createServer = originalCreateServer;
syncBuiltinESMExports();

export default function handler(req, res) {
  if (!requestHandler) {
    res.statusCode = 500;
    res.end("Server handler was not initialised.");
    return;
  }
  return requestHandler(req, res);
}
