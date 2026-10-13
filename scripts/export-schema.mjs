import { writeFileSync } from "node:fs";
import { z } from "zod";
import { PackSchema } from "../packages/core/dist/index.js";
writeFileSync(
  new URL("../docs/scenario-pack.schema.json", import.meta.url),
  JSON.stringify(z.toJSONSchema(PackSchema), null, 2) + "\n",
);
