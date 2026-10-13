import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "./store.js";
import { createApp } from "./app.js";
const directory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
dotenv.config({ path: path.join(directory, ".env"), quiet: true });
const port = Number(process.env.PORT || 4310);
const store = openStore(
  process.env.LIFEKIT_DATA_DIR || path.join(directory, "data"),
);
const app = createApp(
  store,
  {
    baseURL: process.env.AI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.AI_MODEL || "",
    apiKey: process.env.AI_API_KEY || "",
  },
  path.resolve(directory, "../frontend/dist"),
);
const server = app.listen(port, process.env.LIFEKIT_HOST || "127.0.0.1", () =>
  console.log(`LifeKit is ready: http://127.0.0.1:${port}`),
);
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
  store.db.close();
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () =>
    server.close(() => {
      store.db.close();
      process.exit(0);
    }),
  );
