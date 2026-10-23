import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// D: target-browser integration checks. AI/download fixtures never call a real model.
let chromium;
for (const candidate of [process.env.DESIGN_PLAYWRIGHT_PACKAGE, path.resolve('package.json'), path.resolve('../../ch6-ci-main/teaching-agent/package.json')].filter(Boolean)) {
 try { ({ chromium } = createRequire(candidate)('playwright')); break; } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
}
if (!chromium) throw new Error('Playwright is declared in package.json but unavailable. Set DESIGN_PLAYWRIGHT_PACKAGE to an existing installation.');
const origin = process.env.DESIGN_BASE_URL || 'http://127.0.0.1:43310';
const output = path.resolve(process.env.DESIGN_OUTPUT || 'test-results/kimi-web');
fs.mkdirSync(output, { recursive: true });
const checks = [], errors = [], metrics = {};
let page, browser, context, scenario = 'success', attempts = 0, releaseLate;
const complete = (label, detail) => { checks.push({ label, passed: true, detail }); console.log('PASS '+label); };
const sse = (...events) => events.map(event => 'data: '+JSON.stringify(event)+'\n\n').join('');
const responseText = '# 受弯承载力\n\n先从钢筋与混凝土的协同工作出发，理解受力过程。\n\n## 三个阶段\n\n| 阶段 | 现象 |\n| --- | --- |\n| 开裂前 | 截面共同工作 |\n| 开裂后 | 裂缝逐渐发展 |\n\n截面高度为 $h_0$。\n\n```text\n检查已知条件 → 判断破坏形态 → 选择计算关系\n```';
async function shot(name) { await page.screenshot({ path:path.join(output,name+'.png') }); }
async function navigate(label) {
 let control=page.getByRole('button',{name:label,exact:true});
 if (!(await control.isVisible())) { await page.getByRole('button',{name:'Toggle Sidebar',exact:true}).click(); control=page.getByRole('button',{name:label,exact:true}); }
 await control.click();
}
async function editor() { return page.locator('.kimi-chat-view[data-compact="false"] textarea'); }
async function waitInput() { const input=await editor(); await input.waitFor(); return input; }
async function assertNoOverflow(label) {
 const sizes=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
 assert.ok(sizes.document <= sizes.viewport+1,JSON.stringify(sizes)); complete(label,sizes);
}
try {
 browser=await chromium.launch({channel:process.env.DESIGN_BROWSER_CHANNEL || 'chrome'});
 context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,colorScheme:'light',reducedMotion:'reduce',acceptDownloads:true});
 page=await context.newPage(); page.setDefaultTimeout(25000);
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/models',route=>route.fulfill({json:{models:[{id:'school:fixture',provider:'school',model:'deepseek-fixture',label:'教学模型 · 标准'},{id:'stepfun:fixture',provider:'stepfun',model:'step-fixture',label:'教学模型 · 推理'}],defaultId:'school:fixture'}}));
 await page.route('**/api/chat',async route=>{
  attempts++;
  if(scenario==='error'){scenario='success';return route.fulfill({status:503,json:{error:'连接暂时不可用，请重试这一轮。'}});}
  if(scenario==='late') { await new Promise(resolve=>{releaseLate=resolve;}); return route.fulfill({contentType:'text/event-stream',body:sse({type:'text',delta:'不应出现的晚到结果'},{type:'done'})}).catch(()=>{}); }
  if(scenario==='card') return route.fulfill({contentType:'text/event-stream',body:sse({type:'text',delta:'先判断哪一种材料先屈服。'},{type:'card',card:{kind:'choice',prompt:'适筋梁受弯时，哪一种材料先达到屈服？',options:[{id:'A',text:'受拉钢筋'},{id:'B',text:'受压混凝土'}],topic:'K2'}},{type:'done'})});
  return route.fulfill({contentType:'text/event-stream',body:sse({type:'text',delta:responseText},{type:'done'})});
 });
 const health=await context.request.get(origin+'/api/health'); assert.equal(health.status(),200); complete('real-server-health');
 await page.goto(origin,{waitUntil:'networkidle',timeout:120000});
 await page.getByRole('button',{name:'引导学习',exact:true}).waitFor();
 await page.waitForTimeout(200); await shot('home');
 await page.getByRole('button',{name:'全部知识点',exact:true}).click();
 assert.equal(await page.locator('.kimi-page ol > li').count(),14);await page.getByRole('button',{name:'收起目录',exact:true}).click();complete('course-outline-expand-collapse');
 await page.getByRole('button',{name:'引导学习',exact:true}).click();
 let input=await waitInput();
 assert.ok(await page.getByRole('button',{name:'发送',exact:true}).isDisabled());
 const geometry=await page.locator('.kimi-composer:visible').evaluate(el=>{const b=el.getBoundingClientRect(),style=getComputedStyle(el),t=el.querySelector('textarea'),ts=getComputedStyle(t);return{x:b.x,y:b.y,width:b.width,height:b.height,radius:style.borderRadius,font:ts.fontFamily,fontSize:ts.fontSize,lineHeight:ts.lineHeight,background:style.backgroundColor};});
 assert.equal(geometry.width,768);assert.equal(geometry.height,114);assert.equal(geometry.radius,'24px');assert.equal(geometry.fontSize,'16px');assert.equal(geometry.lineHeight,'24px');metrics.composer=geometry;
 const sidebarWidth=await page.locator('[data-sidebar="sidebar"]:visible').evaluate(el=>el.parentElement.getBoundingClientRect().width);assert.equal(sidebarWidth,240);
 complete('source-geometry-font-binding',{...geometry,sidebarWidth});await shot('chat');
 await page.getByRole('combobox',{name:'选择模型',exact:true}).click();
 const firstOption=page.getByRole('option').filter({hasText:'教学模型 · 标准'});await firstOption.waitFor();
 assert.equal(await firstOption.locator(':scope > span').first().evaluate(el=>getComputedStyle(el).color),'rgb(23, 131, 255)');
 await shot('model-menu');await page.getByRole('option').filter({hasText:'教学模型 · 推理'}).click();assert.match(await page.getByRole('combobox',{name:'选择模型',exact:true}).innerText(),/推理/);complete('model-menu-selection-original-accent');
 const cdp=await context.newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');const dom=await cdp.send('DOM.getDocument');const node=await cdp.send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'.kimi-chat-welcome h1'});metrics.platformFonts=await cdp.send('CSS.getPlatformFontsForNode',{nodeId:node.nodeId});
 for(const file of ['arrow.svg','folder.svg','document.svg','download.svg','copy.svg']) assert.equal((await context.request.get(origin+'/design/kimi-web/'+file)).status(),200);complete('original-svg-assets-loaded');
 await page.locator('.kimi-shortcuts > button').first().click();assert.ok((await input.inputValue()).length>0);assert.equal(attempts,0);complete('suggestion-fills-draft-without-submitting');
 await input.fill('草稿：先判断破坏形态');await input.press('Shift+Enter');await input.type('再核对截面条件');
 assert.match(await input.inputValue(),/\n/);
 await input.evaluate(el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true})));assert.equal(attempts,0);complete('multiline-and-composing-enter');
 const draft=await input.inputValue();await navigate('自学天地');await page.goBack();input=await waitInput();assert.equal(await input.inputValue(),draft);complete('browser-back-retains-draft');
 await page.reload({waitUntil:'networkidle'});input=await waitInput();assert.equal(await input.inputValue(),draft);complete('refresh-restores-tab-draft');
 await input.fill('比较两种受力阶段');scenario='error';await input.press('Enter');await page.getByRole('alert').filter({hasText:'连接暂时不可用'}).waitFor();await shot('error');
 await page.getByRole('button',{name:'重试这一轮',exact:true}).click();await page.getByRole('heading',{name:'受弯承载力',exact:true}).waitFor();assert.equal(await page.locator('.kimi-messages .katex').count(),1);assert.equal(await page.locator('.kimi-messages table').count(),1);await page.getByRole('button',{name:'复制代码',exact:true}).click();await page.getByRole('status').filter({hasText:'已复制代码'}).waitFor();complete('failed-request-retry-rich-result-code-copy');await shot('result');
 await page.getByRole('button',{name:'收藏到笔记',exact:true}).click();
 const noteControl=()=>page.locator('[data-sidebar="content"]').getByRole('button').filter({hasText:'受弯承载力'}).first();
 await noteControl().click();await page.getByRole('dialog').waitFor();await page.getByRole('textbox',{name:'笔记标题',exact:true}).fill('未保存标题');await page.getByRole('button',{name:'取消',exact:true}).click();
 await noteControl().click();assert.equal(await page.getByRole('textbox',{name:'笔记标题',exact:true}).inputValue(),'受弯承载力');
 await page.getByRole('textbox',{name:'笔记标题',exact:true}).fill('');assert.ok(await page.getByRole('button',{name:'保存',exact:true}).isDisabled());
 await page.getByRole('textbox',{name:'笔记标题',exact:true}).fill('受弯承载力 · 复习笔记');await page.getByRole('textbox',{name:'笔记内容',exact:true}).fill('先理解破坏形态，再选择计算关系。');await shot('note-editor');
 await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});await page.waitForTimeout(150);await page.reload({waitUntil:'networkidle'});await noteControl().waitFor();
 await noteControl().click();assert.match(await page.getByRole('textbox',{name:'笔记标题',exact:true}).inputValue(),/复习笔记/);await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});
 assert.ok(await noteControl().evaluate(el=>el===document.activeElement));complete('note-cancel-validation-save-persist-escape-focus');
 input=await waitInput();await input.fill('测试停止');scenario='late';await input.press('Enter');await page.getByRole('button',{name:'停止生成',exact:true}).waitFor();await shot('loading');
 await page.getByRole('button',{name:'停止生成',exact:true}).click();await page.getByRole('status').filter({hasText:'已停止生成'}).waitFor();releaseLate?.();await page.waitForTimeout(200);assert.equal(await page.getByText('不应出现的晚到结果',{exact:true}).count(),0);complete('stop-cancels-ui-and-rejects-late-result');
 scenario='card';await page.reload({waitUntil:'networkidle'});input=await waitInput();await input.fill('开始一次引导练习');await input.press('Enter');await page.getByText('适筋梁受弯时，哪一种材料先达到屈服？',{exact:true}).waitFor();assert.ok(await input.isDisabled());await shot('answer-card');complete('unanswered-card-blocks-free-input');
 scenario='success';
 await navigate('资料下载');await page.getByRole('textbox',{name:'搜索资料',exact:true}).fill('不存在的资料123');await page.getByText('没有找到匹配的资料',{exact:true}).waitFor();await shot('empty');await page.getByRole('button',{name:'清除筛选',exact:true}).click();
 await page.getByRole('button',{name:'逐页讲解',exact:true}).click();assert.ok((await page.locator('.kimi-material-card').count())>0);await page.getByRole('button',{name:'全部资料',exact:true}).click();complete('catalog-search-category-empty-reset');
 let downloadFails=true;await page.route('**/api/materials?*',route=>downloadFails ? (downloadFails=false,route.fulfill({status:503,json:{error:'资料暂时不可用，请重试'}})) : route.fulfill({contentType:'application/pdf',body:'%PDF-1.4\n% Local UI verification fixture\n%%EOF'}));
 await page.getByRole('button',{name:'下载原版课件',exact:true}).click();await page.getByRole('alert').filter({hasText:'资料暂时不可用'}).waitFor();const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'重试下载',exact:true}).click();const download=await downloadPromise;assert.match(download.suggestedFilename(),/原版课件\.pdf$/);complete('download-error-retry-real-browser-download');await shot('materials');
 await page.unroute('**/api/materials?*');let releaseDownload;let lateDownloads=0;const recordLate=()=>lateDownloads++;page.on('download',recordLate);
 await page.route('**/api/materials?*',async route=>{await new Promise(resolve=>releaseDownload=resolve);await route.fulfill({contentType:'application/pdf',body:'%PDF-1.4\n%%EOF'}).catch(()=>{});});
 await page.getByRole('button',{name:'下载原版课件',exact:true}).click();await page.getByRole('button',{name:'取消下载',exact:true}).click();await page.getByRole('status').filter({hasText:'已取消下载'}).waitFor();releaseDownload?.();await page.waitForTimeout(150);assert.equal(lateDownloads,0);page.off('download',recordLate);complete('download-cancel-ignores-late-file');
 await navigate('自学天地');const slide=page.locator('img[src*="/slides/slide-"]:visible').first();await slide.evaluate(el=>el.decode());assert.ok(await slide.evaluate(el=>el.naturalWidth>0));
 await page.getByRole('button',{name:'收藏这一页',exact:true}).click();await page.getByRole('button',{name:'取消收藏这一页',exact:true}).waitFor();await page.getByRole('button',{name:'章节',exact:true}).click();assert.equal(await page.getByRole('button',{name:'章节',exact:true}).getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.getByRole('button',{name:'章节',exact:true}).getAttribute('aria-expanded'),'false');await shot('study');complete('actual-slides-bookmark-chapter-escape');
 await page.getByRole('button',{name:'问 AI',exact:true}).click();const ai=page.locator('aside textarea');await ai.waitFor();await ai.fill('侧栏里的独立草稿');await page.locator('aside').getByRole('button',{name:'收起',exact:true}).click();await page.getByRole('button',{name:'问 AI',exact:true}).click();assert.equal(await ai.inputValue(),'侧栏里的独立草稿');await page.locator('aside').getByRole('button',{name:'收起',exact:true}).click();complete('assistant-panel-return-and-independent-draft');
 if(fs.existsSync('src/components/SelfTestView.tsx')) {
  await navigate('题库自测');await page.getByRole('heading',{name:'题库自测',exact:true}).waitFor();await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'5 题',exact:true}).click();await page.getByRole('button',{name:'开始自测',exact:true}).click();await page.getByRole('button',{name:'交卷',exact:true}).waitFor();await shot('self-test');complete('branch-self-test-start');
 }
 if(fs.existsSync('src/components/ClassroomView.tsx')) {
  await navigate('实时课堂');await page.getByRole('heading',{name:/实时课堂/}).waitFor();assert.equal(await page.getByText(/CLASSROOM_DB_PATH|CLASSROOM_TEACHER_ACCESS_CODE/).count(),0);await shot('classroom');complete('branch-classroom-entry-friendly-configuration-state');
 }
 await page.setViewportSize({width:390,height:844});await navigate('引导对话');await assertNoOverflow('narrow-chat-no-page-overflow');await shot('mobile-chat');
 await navigate('自学天地');await page.getByRole('button',{name:'问 AI',exact:true}).click();await page.locator('aside textarea').waitFor();await page.locator('aside').getByRole('button',{name:'收起',exact:true}).click();await slide.waitFor();complete('narrow-assistant-return-to-slide');
 await navigate('资料下载');await assertNoOverflow('narrow-catalog-no-page-overflow');await shot('mobile-catalog');
 await page.emulateMedia({colorScheme:'dark'});await page.waitForTimeout(200);const darkCardColor=await page.locator('.kimi-material-card').first().evaluate(el=>getComputedStyle(el).color);assert.equal(darkCardColor,'rgb(224, 224, 224)');await shot('dark');const bodyColor=await page.evaluate(()=>getComputedStyle(document.body).backgroundColor);assert.equal(bodyColor,'rgb(24, 24, 23)');complete('system-dark-theme-content-contrast',{bodyColor,darkCardColor});
 await page.emulateMedia({colorScheme:'light'});await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.style.fontSize='200%');await assertNoOverflow('large-text-no-page-overflow');await shot('large-text');await page.evaluate(()=>document.documentElement.style.fontSize='');
 const durations=await page.locator('.kimi-category-tabs > button').first().evaluate(el=>getComputedStyle(el).transitionDuration);assert.ok(durations.split(',').every(v=>parseFloat(v)<0.01));complete('reduced-motion-completes-immediately',durations);
 assert.deepEqual(errors,[]);complete('no-runtime-or-hydration-errors');
} catch(error) {
 if(page)await shot('failed').catch(()=>{});
 checks.push({label:'failure',passed:false,error:error.stack||String(error)});console.error(error);process.exitCode=1;
} finally {
 releaseLate?.();
 fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify({classification:'D target integration tests; not original Kimi evidence',origin,checkedAt:new Date().toISOString(),browser:'Chrome on Windows; desktop and 390px emulation; not Android/iOS acceptance',networkBoundary:'real Next server and slide assets; deterministic intercepted model and material responses',checks,metrics,runtimeErrors:errors},null,2));
 await context?.close();await browser?.close();
}
