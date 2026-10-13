import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { createCanvas } from "@napi-rs/canvas";

await build({
  entryPoints: ["backend/src/runtime.ts"],
  outfile: "desktop-dist/backend.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  external: ["pdfjs-dist", "@napi-rs/canvas"],
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
});
mkdirSync("desktop/assets", { recursive: true });
const canvas = createCanvas(256, 256),
  context = canvas.getContext("2d");
context.fillStyle = "#7361ce";
context.beginPath();
context.roundRect(0, 0, 256, 256, 58);
context.fill();
context.strokeStyle = "#ffffff";
context.lineWidth = 12;
context.lineCap = "round";
context.lineJoin = "round";
for (const y of [76, 128, 180]) {
  context.beginPath();
  context.moveTo(51, y);
  context.lineTo(63, y + 12);
  context.lineTo(84, y - 12);
  context.stroke();
  context.beginPath();
  context.moveTo(112, y);
  context.lineTo(198, y);
  context.stroke();
}
const png = canvas.toBuffer("image/png");
writeFileSync("desktop/assets/lifekit.png", png);
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
writeFileSync("desktop/assets/lifekit.ico", Buffer.concat([header, png]));
console.log("Desktop backend and application icon prepared.");
