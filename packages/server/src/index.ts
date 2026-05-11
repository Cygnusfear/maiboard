import { handleApi } from "./routes";
import { readConfig } from "./projects/config";

const config = readConfig();

const server = Bun.serve({
  port: config.server.port,
  async fetch(req) {
    const apiResponse = await handleApi(req);
    if (apiResponse) return apiResponse;

    return new Response("Not Found", { status: 404 });
  },
});

// Write PID so the CLI can detect a running server.
const pidPath = new URL("../.maiboard.pid", import.meta.url).pathname;
await Bun.write(pidPath, String(process.pid));
process.on("exit", () => {
  try {
    require("fs").unlinkSync(pidPath);
  } catch {}
});

console.log(`Maiboard API running on http://localhost:${server.port}`);
