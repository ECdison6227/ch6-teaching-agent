import assert from "node:assert/strict";
import path from "node:path";

/** Actual production HTTPS, existing credentials and isolated test data. */
export async function classroomBrowserCheck({ context, page, origin, basePath, output, assertTeacherStreams }) {
  const endpoint = origin + basePath, errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(endpoint + "/classroom", { waitUntil: "networkidle" });
  await page.getByLabel("访问码", { exact: true }).fill("classroom-browser-test-only");
  await page.getByRole("button", { name: "进入课堂", exact: true }).click();
  await page.getByRole("button", { name: "新建课堂", exact: true }).click();
  await page.getByLabel("课堂名称", { exact: true }).fill("CI 实时课堂");
  await page.getByRole("button", { name: "创建课堂", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "邀请学生", exact: true }).click();
  const invite = page.getByRole("textbox", { name: "学生入课链接", exact: true });
  await invite.waitFor();
  const url = await invite.inputValue();
  assert.ok(url.startsWith(endpoint + "/join/"), "Invite must preserve HTTPS origin and basePath");
  assert.match(url, /\/join\/\d{6}$/);
  const qr = page.getByRole("img", { name: "学生入课二维码", exact: true });
  await qr.evaluate(image => image.decode());
  assert.ok(await qr.evaluate(image => image.naturalWidth > 0));
  await qr.screenshot({ path: path.join(output, "classroom-qr.png") });
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const code = url.split("/").at(-1), student = await context.newPage();
  student.on("pageerror", error => errors.push(error.message));
  await student.goto(endpoint + "/join", { waitUntil: "networkidle" });
  await student.getByLabel("课堂码", { exact: true }).fill(code);
  await student.getByLabel("姓名", { exact: true }).fill("浏览器学生");
  await student.getByRole("button", { name: "加入课堂", exact: true }).click();
  await student.getByRole("heading", { name: "等老师开始上课", exact: true }).waitFor();
  const cookies = await context.cookies(endpoint + "/");
  for (const name of ["ch6_classroom_teacher", "ch6_classroom_student"]) {
    const cookie = cookies.find(cookie => cookie.name === name); assert.ok(cookie, name);
    assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, "Lax");
    assert.equal(cookie.path, (basePath || "") + "/");
  }
  await page.bringToFront();
  await page.getByText(/1 人加入/).waitFor();
  await page.getByRole("button", { name: "开始上课", exact: true }).click();
  await student.bringToFront();
  await student.getByRole("heading", { name: "等老师发题", exact: true }).waitFor();
  const { questions } = await page.evaluate(async url => { const response = await fetch(url); if (!response.ok) throw new Error("Teacher catalog failed"); return response.json(); }, endpoint + "/api/classrooms/catalog");
  for (const type of ["choice", "judge", "fill"]) {
    await page.bringToFront();
    const q = questions.find(q => q.type === type); assert.ok(q, type);
    await page.getByRole("button", { name: type === "choice" ? "选择题目" : "下一题", exact: true }).click();
    await page.getByRole("textbox", { name: "搜索课堂题目", exact: true }).fill(q.id);
    await page.getByRole("group", { name: "选择课堂题目", exact: true }).getByRole("button").filter({ hasText: q.id + " ·" }).click();
    await page.getByRole("button", { name: "发布题目", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await student.bringToFront();
    const answerButton = student.getByRole("button", { name: "提交答案", exact: true });
    await answerButton.waitFor();
    if (type === "fill") await student.getByRole("textbox", { name: "你的答案", exact: true }).fill("浏览器填空答案");
    else await student.getByRole("group", { name: "选择答案", exact: true }).getByRole("button").first().click();
    // Unsubmitted drafts also survive reload, without exposing the standard answer.
    await student.reload({ waitUntil: "domcontentloaded" });
    await answerButton.waitFor(); await answerButton.click();
    await student.getByRole("button", { name: "更新答案", exact: true }).waitFor();
    if (type === "choice") {
      await student.getByRole("group", { name: "选择答案", exact: true }).getByRole("button").nth(1).click();
      await student.route("**/api/classroom-participation/**/answer", route => route.abort("failed"));
      await student.getByRole("button", { name: "更新答案", exact: true }).click();
      await student.getByRole("status").filter({ hasText: "提交失败，可重试" }).waitFor();
      await student.unroute("**/api/classroom-participation/**/answer");
      await student.getByRole("button", { name: "更新答案", exact: true }).click();
      await student.getByRole("status").filter({ hasText: /^已提交/ }).waitFor();
    }
    await page.bringToFront(); await page.getByRole("status").filter({ hasText: /已答 1\/1/ }).waitFor();
    await student.bringToFront();
    assert.ok(!(await student.getByRole("region", { name: "当前课堂题目" }).innerText()).includes("标准答案："));
    await student.reload({ waitUntil: "domcontentloaded" });
    await student.getByRole("button", { name: "更新答案", exact: true }).waitFor();
    await page.bringToFront(); await page.getByText(/1 人加入/).waitFor();
    await page.getByRole("button", { name: "收题", exact: true }).click();
    await student.bringToFront(); await student.getByText("等待老师公布答案", { exact: true }).waitFor();
    assert.equal(await student.getByRole("button", { name: "更新答案", exact: true }).count(), 0);
    await page.bringToFront(); await page.getByRole("button", { name: "公布答案", exact: true }).click();
    await student.bringToFront(); await student.getByRole("region", { name: "当前课堂题目" }).getByText("标准答案：", { exact: false }).waitFor();
  }
  await page.bringToFront(); await page.goto(endpoint + "/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "引导学习", exact: true }).click();
  const chatDraft = page.locator("textarea:visible").first(); await chatDraft.fill("切换页面后保留的对话草稿");
  const shellUrl = page.url();
  async function navigate(label) {
    let button = page.getByRole("button", { name: label, exact: true });
    if (!(await button.isVisible())) { await page.getByRole("button", { name: "Toggle Sidebar", exact: true }).filter({ visible: true }).first().click(); button = page.getByRole("button", { name: label, exact: true }); }
    await button.click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
  }
  await navigate("题库自测"); await page.getByRole("heading", { name: "题库自测", exact: true }).waitFor();
  await navigate("实时课堂"); await page.getByRole("button", { name: "邀请学生", exact: true }).waitFor(); await assertTeacherStreams(1);
  await navigate("引导对话"); assert.equal(await chatDraft.inputValue(), "切换页面后保留的对话草稿"); await assertTeacherStreams(0);
  assert.equal(page.url(), shellUrl, "Navigation must preserve the mounted chat pane");
  await navigate("实时课堂"); await page.getByRole("button", { name: "邀请学生", exact: true }).waitFor(); await assertTeacherStreams(1);
  await page.screenshot({ path: path.join(output, "classroom-teacher.png"), fullPage: true });
  await student.bringToFront(); await student.screenshot({ path: path.join(output, "classroom-student.png"), fullPage: true });
  await page.bringToFront(); await page.getByRole("button", { name: "结束课堂", exact: true }).click();
  await page.getByRole("button", { name: "确认结束", exact: true }).click();
  await student.bringToFront(); await student.getByText("课堂已结束，感谢参与。", { exact: true }).waitFor();
  assert.deepEqual(errors, []); await student.close();
  console.log("PASS classroom: HTTPS/Secure cookies, QR, join, 3 types, retry, draft restore, close/reveal/end, unified navigation, subscription cleanup");
}
