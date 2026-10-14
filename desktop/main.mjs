import { app, BrowserWindow, Menu, dialog, session, shell } from "electron";
import { mkdirSync, existsSync, copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { startDesktopBackend } from "../desktop-dist/backend.mjs";
import { smokeTest } from "./smoke.mjs";

const argument = (name) =>
  process.argv
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
const smoke = process.argv.includes("--lifekit-smoke-test");
const smokeDirectory = argument("--lifekit-smoke-dir");
app.setName("LifeKit");
app.setPath(
  "userData",
  smoke && smokeDirectory
    ? path.resolve(smokeDirectory)
    : path.join(app.getPath("appData"), "LifeKit"),
);

let backend;
let mainWindow;
let stopping = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.show();
    mainWindow?.focus();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (!backend || stopping) return;
    event.preventDefault();
    stopping = true;
    backend.close().finally(() => app.quit());
  });

  app
    .whenReady()
    .then(async () => {
      const root = app.getAppPath();
      const userData = app.getPath("userData");
      mkdirSync(userData, { recursive: true });
      const configPath = path.join(userData, ".env");
      if (!existsSync(configPath)) {
        copyFileSync(
          app.isPackaged
            ? path.join(process.resourcesPath, "lifekit.env.example")
            : path.join(root, "backend", ".env.example"),
          configPath,
        );
      }
      backend = await startDesktopBackend({
        dataDirectory: path.join(userData, "data"),
        configPath,
        frontendPath: path.join(root, "frontend", "dist"),
      });
      if (smoke) {
        const result = await smokeTest(backend.url, userData);
        const reportPath = argument("--lifekit-smoke-report");
        if (reportPath)
          writeFileSync(reportPath, JSON.stringify(result, null, 2));
        await backend.close();
        app.exit(0);
        return;
      }

      session.defaultSession.setPermissionRequestHandler(
        (_contents, _permission, callback) => callback(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      session.defaultSession.webRequest.onHeadersReceived(
        (details, callback) => {
          if (!details.url.startsWith(backend.url + "/"))
            return callback({ responseHeaders: details.responseHeaders });
          callback({
            responseHeaders: {
              ...details.responseHeaders,
              "Content-Security-Policy": [
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'self'; frame-src 'self'; base-uri 'self'; form-action 'self'",
              ],
            },
          });
        },
      );
      const preferences = {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      };
      const restrictNavigation = (window) => {
        window.webContents.on("will-navigate", (event, url) => {
          if (new URL(url).origin !== backend.url) event.preventDefault();
        });
        window.webContents.on("will-attach-webview", (event) =>
          event.preventDefault(),
        );
      };
      mainWindow = new BrowserWindow({
        title: "LifeKit",
        width: 1280,
        height: 860,
        minWidth: 760,
        minHeight: 560,
        backgroundColor: "#f7f8fa",
        show: false,
        icon: path.join(root, "desktop", "assets", "lifekit.png"),
        webPreferences: preferences,
      });
      restrictNavigation(mainWindow);
      mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        const parsed = new URL(url);
        if (
          parsed.origin === backend.url &&
          /^\/api\/documents\/[a-f0-9-]+\/pdf$/.test(parsed.pathname)
        ) {
          // The existing source-PDF action opens a separate, isolated document window.
          const pdfWindow = new BrowserWindow({
            parent: mainWindow,
            title: "LifeKit · 원문 PDF",
            width: 950,
            height: 820,
            webPreferences: preferences,
          });
          restrictNavigation(pdfWindow);
          pdfWindow.webContents.setWindowOpenHandler(() => ({
            action: "deny",
          }));
          void pdfWindow.loadURL(url);
        }
        return { action: "deny" };
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "LifeKit",
            submenu: [
              {
                label: "데이터 폴더 열기",
                click: () => void shell.openPath(path.join(userData, "data")),
              },
              {
                label: "AI 설정 파일 위치 열기",
                click: () => shell.showItemInFolder(configPath),
              },
              {
                label: "설정 적용 후 앱 다시 시작",
                click: () => {
                  app.relaunch();
                  app.quit();
                },
              },
              { type: "separator" },
              { label: "종료", role: "quit" },
            ],
          },
          {
            label: "편집",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "보기",
            submenu: [
              { role: "reload" },
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
              { role: "togglefullscreen" },
            ],
          },
          {
            label: "도움말",
            submenu: [
              {
                label: "LifeKit 정보",
                click: () =>
                  void dialog.showMessageBox(mainWindow, {
                    type: "info",
                    title: "LifeKit",
                    message: `LifeKit ${app.getVersion()}`,
                    detail:
                    "상황별 실행 순서와 체크리스트를 관리하는 로컬 도구\n데이터는 이 PC의 사용자 폴더에 저장됩니다.",
                  }),
              },
            ],
          },
        ]),
      );
      mainWindow.once("ready-to-show", () => mainWindow.show());
      mainWindow.on("closed", () => {
        mainWindow = undefined;
      for (const window of BrowserWindow.getAllWindows()) window.close();
      });
      await mainWindow.loadURL(backend.url);
    })
    .catch(async (error) => {
      const reportPath = argument("--lifekit-smoke-report");
      if (smoke && reportPath)
        writeFileSync(
          reportPath,
          JSON.stringify(
            { ok: false, error: String(error?.stack || error) },
            null,
            2,
          ),
        );
      if (!smoke)
        dialog.showErrorBox(
          "LifeKit을 실행할 수 없습니다",
          error instanceof Error ? error.message : String(error),
        );
      if (backend) await backend.close();
      app.exit(1);
    });
}
