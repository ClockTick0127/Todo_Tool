import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { openStore } from "./store.js";
import { createApp } from "./app.js";

export async function startDesktopBackend(options: {
  dataDirectory: string;
  configPath: string;
  frontendPath: string;
}) {
  const settings = dotenv.parse(readFileSync(options.configPath));
  const store = openStore(options.dataDirectory);
  const app = createApp(
    store,
    {
      baseURL: settings.AI_BASE_URL || "https://api.openai.com/v1",
      model: settings.AI_MODEL || "",
      apiKey: settings.AI_API_KEY || "",
    },
    options.frontendPath,
    {
      desktop: true,
      dataDirectory: options.dataDirectory,
      configPath: options.configPath,
    },
  );
  const server = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
  } catch (error) {
    store.db.close();
    throw error;
  }
  let closed = false;
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: async () => {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      store.db.close();
    },
  };
}
