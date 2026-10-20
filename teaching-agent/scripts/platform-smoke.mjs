import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, webkit, _android } from "playwright";
import { createServer as createHttpsServer } from "node:https";
import { request as httpRequest } from "node:http";
import { networkInterfaces, tmpdir } from "node:os";
import { classroomBrowserCheck } from "./classroom-browser-check.mjs";

const platform = process.env.CI_BROWSER || "chromium";
if (!["chromium", "webkit", "android"].includes(platform)) throw new Error(`Unknown browser: ${platform}`);
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/+$/, "");
const port = Number(process.env.CI_SMOKE_PORT || 3100);
assert.ok(Number.isInteger(port) && port >= 1024 && port < 65535, "Invalid smoke port");
const origin = `http://127.0.0.1:${port}`;
const address = Object.values(networkInterfaces()).flat().find(entry => entry?.family === "IPv4" && !entry.internal)?.address;
assert.ok(address, "Classroom HTTPS smoke needs a LAN interface");
const classroomOrigin = `https://${platform === "android" ? "10.0.2.2" : address}:${port + 1}`;
const classroomDirectory = fs.mkdtempSync(path.join(tmpdir(), "classroom-browser-"));
const output = path.resolve("test-results", platform);
fs.mkdirSync(output, { recursive: true });
const log = fs.createWriteStream(path.join(output, "server.log"));
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", CLASSROOM_TEACHER_ACCESS_CODE: "classroom-browser-test-only", CLASSROOM_PUBLIC_ORIGIN: classroomOrigin, CLASSROOM_DB_PATH: path.join(classroomDirectory, "classroom.sqlite") }, stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(log, { end: false });
server.stderr.pipe(log, { end: false });
let startupError;
server.on("error", error => { startupError = error; });
const deadline = setTimeout(() => {
  console.error("Browser smoke exceeded its 4 minute deadline");
  server.kill();
  process.exit(1);
}, 240_000);

let browser;
let device;
let context;
let page;
let tracing = false;
const httpsProxy = createHttpsServer({ key: fs.readFileSync("tests/fixtures/tls/key.pem"), cert: fs.readFileSync("tests/fixtures/tls/cert.pem") }, (request, response) => {
  const upstream = httpRequest(origin + request.url, { method: request.method, headers: { ...request.headers, "x-real-ip": request.socket.remoteAddress || "test" } }, result => {
    response.writeHead(result.statusCode, result.headers); result.pipe(response);
  });
  request.pipe(upstream);
  upstream.on("error", () => { response.writeHead(502); response.end(); });
  response.on("close", () => upstream.destroy());
});
try {
  httpsProxy.listen(port + 1, "0.0.0.0"); await once(httpsProxy, "listening");
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (startupError) throw startupError;
    if (server.exitCode !== null) throw new Error(`Next.js exited with code ${server.exitCode}; see ${output}/server.log`);
    try {
      const response = await fetch(`${origin}${basePath}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        const health = await response.json();
        assert.equal(health.status, "ok");
        assert.equal(health.basePath, basePath);
        ready = true;
        break;
      }
    } catch { /* The production server is still starting. */ }
    await delay(500);
  }
  assert.ok(ready, "Production health endpoint did not become ready");

  if (platform === "android") {
    execFileSync("adb", ["reverse", `tcp:${port}`, `tcp:${port}`], { timeout: 30_000 });
    const devices = await _android.devices();
    assert.equal(devices.length, 1, "Exactly one real Android emulator must be connected");
    [device] = devices;
    device.setDefaultTimeout(30_000);
    const chrome = (await device.shell("pm list packages com.android.chrome")).toString();
    assert.ok(chrome.includes("package:com.android.chrome"), "Android system image must include Chrome");
    await device.shell("am force-stop com.android.chrome");
    context = await device.launchBrowser({ viewport: { width: 393, height: 851 }, reducedMotion: "reduce", ignoreHTTPSErrors: true });
    console.log(`Android device: ${device.model()} (${device.serial()})`);
  } else {
    browser = await (platform === "webkit" ? webkit : chromium).launch();
    context = await browser.newContext({ viewport: { width: 1365, height: 900 }, reducedMotion: "reduce", ignoreHTTPSErrors: true });
  }
  context.setDefaultTimeout(30_000);
  await context.tracing.start({ screenshots: true, snapshots: true });
  tracing = true;
  page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const response = await page.goto(`${origin}${basePath}/`, { waitUntil: "networkidle" });
  assert.equal(response.status(), 200);
  assert.match(await page.title(), /第六章/);
  if (platform === "android") {
    assert.match(await page.evaluate(() => navigator.userAgent), /Android/, "Mobile viewport emulation cannot replace an Android browser");
  }
  await page.getByRole("heading", { name: "钢筋混凝土梁承载力计算原理", exact: true }).waitFor();
  await page.getByRole("button", { name: "进入学习", exact: true }).click();
  await page.getByText("先看资料，再做题。", { exact: true }).waitFor();

  async function navigate(label) {
    let button = page.getByRole("button", { name: label, exact: true });
    if (!(await button.isVisible())) {
      await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click();
      button = page.getByRole("button", { name: label, exact: true });
    }
    await button.click();
  }

  await navigate("自学天地");
  const slide = page.locator('img[src*="/slides/slide-"]:visible').first();
  await slide.waitFor();
  await slide.evaluate(image => image.decode());
  assert.ok(await slide.evaluate(image => image.naturalWidth > 0), "Slide image failed to load");
  const src = await slide.getAttribute("src");
  assert.ok(src.startsWith(`${basePath}/slides/`), "Slide must use the configured deployment prefix");
  await page.getByRole("button", { name: "收藏这一页", exact: true }).click();
  await page.getByRole("button", { name: "取消收藏这一页", exact: true }).waitFor();

  // Wait for IndexedDB commit, then prove it survives a complete page reload.
  await page.waitForFunction(() => new Promise((resolve, reject) => {
    const request = indexedDB.open("ch6-notes", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("state", "readonly");
      const read = transaction.objectStore("state").get("notes");
      transaction.oncomplete = () => { db.close(); resolve(read.result?.some(note => note.kind === "page")); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "进入学习", exact: true }).click();
  await navigate("自学天地");
  await page.getByRole("button", { name: "取消收藏这一页", exact: true }).waitFor();
  await page.getByRole("button", { name: "取消收藏这一页", exact: true }).click();
  await page.getByRole("button", { name: "收藏这一页", exact: true }).waitFor();

  await navigate("资料下载");
  await page.getByRole("heading", { name: "资料下载", exact: true }).waitFor();
  await page.getByRole("button", { name: "下载原版课件", exact: true }).waitFor();
  await navigate("引导对话");
  await page.getByText("先看资料，再做题。", { exact: true }).waitFor();
  assert.deepEqual(errors, [], "Browser must not report uncaught runtime or hydration errors");
  await page.screenshot({ path: path.join(output, "passed.png"), fullPage: true });
  console.log(`PASS ${platform}: production health, landing, navigation, slides, IndexedDB persistence (${basePath || "/"})`);
  await classroomBrowserCheck({ context, page, origin: classroomOrigin, basePath, output });
} catch (error) {
  if (page) await page.screenshot({ path: path.join(output, "failed.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  if (tracing) await context.tracing.stop({ path: path.join(output, "trace.zip") }).catch(() => {});
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await device?.close().catch(() => {});
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await Promise.race([exited, delay(5000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  log.end();
  httpsProxy.closeAllConnections(); httpsProxy.close();
  fs.rmSync(classroomDirectory, { recursive: true, force: true });
  clearTimeout(deadline);
}
