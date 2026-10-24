import assert from "node:assert/strict";
import path from "node:path";

/** Runs in the existing real Android / macOS WebKit / Windows Chromium CI contexts. */
export async function sectionExplorationBrowserCheck({ page, origin, basePath, output }) {
  await page.goto(origin + basePath + "/reinforcement-demo", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "单筋与双筋演示", exact: true }).waitFor();
  await page.getByRole("button", { name: "参数探究", exact: true }).click();
  const slider = page.getByRole("slider", { name: "受拉钢筋面积", exact: true });
  await slider.waitFor();
  for (const label of ["少筋情境", "超筋情境"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    assert.equal(await page.getByTestId("section-moment").innerText(), "模型不适用");
  }
  await page.getByRole("button", { name: "适筋情境", exact: true }).click();
  assert.match(await page.getByTestId("section-moment").innerText(), /141\.0/);
  assert.match(await page.getByTestId("section-x").innerText(), /95\.7/);
  assert.equal(await page.getByTestId("section-xi").innerText(), "0.208");
  await slider.press("ArrowRight");
  assert.equal(await slider.inputValue(), "960");
  await page.getByRole("button", { name: "可以，承载力足够即可", exact: true }).click();
  assert.match(await page.getByTestId("audit-feedback").innerText(), /不能证明全部/);
  await page.getByRole("button", { name: "不能，还需核验其他要求", exact: true }).click();
  assert.match(await page.getByTestId("audit-feedback").innerText(), /判断正确/);
  await page.getByText("教学流程", { exact: true }).click();
  await page.getByRole("tab", { name: "课中 · 90分钟", exact: true }).click();
  assert.equal(await page.getByRole("tabpanel").locator("li").count(), 6);
  await page.waitForFunction(() => {
    const state = JSON.parse(localStorage.getItem("ch6-section-exploration-v1") || "null");
    return state?.steelArea === 960 && state?.auditAnswer === "no" && state?.phase === "during" && state?.panel === "exploration";
  });
  await page.reload({ waitUntil: "networkidle" });
  await slider.waitFor();
  assert.equal(await slider.inputValue(), "960");
  assert.match(await page.getByTestId("audit-feedback").innerText(), /判断正确/);
  await page.getByText("教学流程", { exact: true }).click();
  assert.equal(await page.getByRole("tab", { name: "课中 · 90分钟", exact: true }).getAttribute("aria-selected"), "true");
  await page.screenshot({ path: path.join(output, "section-exploration.png"), fullPage: true });
  await page.getByRole("button", { name: "受力演示", exact: true }).click();
  await page.getByRole("button", { name: "双筋梁", exact: true }).click();
  await page.getByRole("slider", { name: "演示进度", exact: true }).press("End");
  await page.getByRole("button", { name: "参数探究", exact: true }).click();
  assert.equal(await slider.inputValue(), "960");
  await page.getByRole("button", { name: "受力演示", exact: true }).click();
  assert.equal(await page.getByRole("slider", { name: "演示进度", exact: true }).inputValue(), "100");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("ch6-section-exploration-v1") || "null")?.panel === "animation");
  assert.deepEqual(await page.evaluate(() => {
    const book = JSON.parse(localStorage.getItem("ch6-section-exploration-v1"));
    return { panel: book.panel, steelArea: book.steelArea };
  }), { panel: "animation", steelArea: 960 });
  console.log("PASS section exploration: source presets, applicability, live input, audit, lesson phases, reload and original animation checkpoint");
}
