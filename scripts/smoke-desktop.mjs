import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
const executable = path.resolve(
  process.argv[2] || "release/win-unpacked/LifeKit.exe",
);
if (!existsSync(executable))
  throw new Error("EXE가 없습니다. npm run desktop:dist를 먼저 실행하세요.");
mkdirSync("test-results", { recursive: true });
const directory = mkdtempSync(path.resolve("test-results/desktop-"));
const report = path.join(directory, "report.json");
const child = spawn(
  executable,
  [
    "--lifekit-smoke-test",
    `--lifekit-smoke-dir=${directory}`,
    `--lifekit-smoke-report=${report}`,
  ],
  { windowsHide: true, stdio: "inherit" },
);
const timeout = setTimeout(() => {
  child.kill();
}, 60000);
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});
clearTimeout(timeout);
if (existsSync(report)) console.log(readFileSync(report, "utf8"));
if (code !== 0)
  throw new Error(`EXE 실행 검사 실패 (exit ${code}). 보고서: ${report}`);
if (!existsSync(report))
  throw new Error("EXE가 검증 보고서를 생성하지 않았습니다.");
const restartReport = path.join(directory, "restart-report.json");
const restarted = spawn(
  executable,
  [
    "--lifekit-smoke-test",
    `--lifekit-smoke-dir=${directory}`,
    `--lifekit-smoke-report=${restartReport}`,
  ],
  { windowsHide: true, stdio: "inherit" },
);
const restartTimeout = setTimeout(() => restarted.kill(), 60000);
const restartCode = await new Promise((resolve, reject) => {
  restarted.once("error", reject);
  restarted.once("exit", resolve);
});
clearTimeout(restartTimeout);
if (restartCode !== 0 || !existsSync(restartReport))
  throw new Error("EXE 재시작 검사에 실패했습니다.");
const result = JSON.parse(readFileSync(restartReport, "utf8"));
if (!result.ok || !result.restartPersistenceVerified)
  throw new Error("EXE 재시작 후 진행 기록이 복원되지 않았습니다.");
console.log(`EXE 실행·재시작 검사 통과. 보고서: ${restartReport}`);
