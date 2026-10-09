import { createApp } from "./app.js";
import { config } from "./config.js";

const server = createApp().listen(config.port, () => {
  console.log(`psp-mock listening on port ${config.port}`);
});

// docker stop sends SIGTERM: close right away instead of waiting for the kill timeout
process.on("SIGTERM", () => server.close());
