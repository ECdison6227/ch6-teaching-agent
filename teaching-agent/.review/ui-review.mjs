import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';
import {getQuestionCatalog} from '../src/lib/question-catalog.ts';
import {createSession,answerSession,submitSession} from '../src/lib/self-test/model.ts';
import {applySessionErrors,EMPTY_WRONGBOOK} from '../src/lib/wrongbook/model.ts';
const origin='http://127.0.0.1:3171';
const skipPrint=process.env.REVIEW_SKIP_PRINT==='1';
const out=path.resolve('test-results/self-test-review');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch();const errors=[];const findings=[];
const q=id=>getQuestionCatalog().find(q=>q.id===id);
const snap=async(page,name)=>page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
async function context(storage={},viewport={width:1365,height:1000},failure={}){
  const c=await browser.newContext({viewport,reducedMotion:'reduce',acceptDownloads:true});
  await c.addInitScript(({storage,failure})=>{
    window.print=()=>{window.__reviewPrinted=true;};
    const open=window.open;window.open=function(...args){const popup=open.apply(this,args);if(popup)popup.print=()=>{popup.__reviewPrinted=true;};return popup;};
    if(!sessionStorage.getItem('review-seeded')){for(const[k,v]of Object.entries(storage))localStorage.setItem(k,JSON.stringify(v));sessionStorage.setItem('review-seeded','yes');}
    const get=Storage.prototype.getItem,set=Storage.prototype.setItem;
    window.__reviewReadFail=!!failure.read;window.__reviewWriteFail=!!failure.write;
    Storage.prototype.getItem=function(key){if(this===localStorage&&key==='ch6-wrongbook-v1'&&window.__reviewReadFail)throw Error('review read blocked');return get.call(this,key);};
    Storage.prototype.setItem=function(key,value){if(this===localStorage&&key==='ch6-wrongbook-v1'&&window.__reviewWriteFail)throw Error('review quota');return set.call(this,key,value);};
  },{storage,failure});
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('request',req=>{if(req.url().includes('/api/chat')||req.url().includes('/api/digest'))errors.push('Unexpected model request: '+req.url());});
  await p.goto(origin+'/self-test',{waitUntil:'networkidle'});return {c,p};
}
async function select(page,label,value){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();}
async function download(page,label){const done=page.waitForEvent('download');await page.getByRole('button',{name:'下载 Markdown',exact:true}).click();const d=await done;const file=path.join(out,label+'-'+d.suggestedFilename());await d.saveAs(file);return fs.readFile(file,'utf8');}
async function print(page,label){const waiting=page.waitForEvent('popup');await page.getByRole('button',{name:'浏览器打印 / 另存为 PDF',exact:true}).click();const popup=await waiting;await popup.waitForFunction(()=>window.__reviewPrinted===true);await snap(popup,label);return popup;}
try{
  const {c,p}=await context({'ch6-notes-v2':[{id:'existing-note',kind:'text',title:'old',text:'review note preserved',at:1}]});
  await p.getByRole('button',{name:'开始自测',exact:true}).waitFor();await snap(p,'desktop-settings');
  await p.getByRole('textbox',{name:'自定义题量'}).fill('0');assert.equal(await p.getByRole('button',{name:'开始自测',exact:true}).isDisabled(),true);await p.getByRole('alert').filter({hasText:'题量须为正整数'}).waitFor();
  await p.getByRole('textbox',{name:'自定义题量'}).fill('10');await p.getByRole('button',{name:'选择题',exact:true}).click();await p.getByRole('button',{name:'判断题',exact:true}).click();await p.getByRole('button',{name:'改为 3 题',exact:true}).click();await p.getByRole('button',{name:'开始自测',exact:true}).click();
  await p.getByRole('textbox',{name:'我的答案'}).waitFor();let s=await p.evaluate(()=>JSON.parse(localStorage.getItem('ch6-self-test-v1')));assert.equal(s.questions.length,3);assert.equal(new Set(s.questions.map(q=>q.id)).size,3);assert(s.questions.every(q=>q.type==='fill'));
  assert.equal(await p.getByText('标准答案',{exact:true}).count(),0);assert.equal(await p.getByText('解析',{exact:true}).count(),0);await snap(p,'desktop-answering');
  await p.getByRole('textbox',{name:'我的答案'}).fill(s.questions[0].answer);await p.getByRole('button',{name:'下一题',exact:true}).click();await p.getByRole('textbox',{name:'我的答案'}).fill('错误唯一标记');await p.getByRole('button',{name:'下一题',exact:true}).click();
  const before=await p.evaluate(()=>JSON.parse(localStorage.getItem('ch6-self-test-v1')));await p.reload({waitUntil:'networkidle'});const restored=await p.evaluate(()=>JSON.parse(localStorage.getItem('ch6-self-test-v1')));assert.deepEqual(restored,before);assert.match(await p.locator('main').innerText(),/第 3 \/ 3 题/);
  await p.getByRole('button',{name:'交卷',exact:true}).click();await p.getByRole('dialog').waitFor();await p.getByRole('button',{name:'继续作答',exact:true}).click();await p.getByRole('dialog').waitFor({state:'hidden'});await p.getByRole('button',{name:'交卷',exact:true}).click();await p.getByRole('button',{name:'确认交卷',exact:true}).click();await p.getByText('自测结果',{exact:true}).waitFor();
  await p.waitForFunction(()=>JSON.parse(localStorage.getItem('ch6-wrongbook-v1'))?.records.length===1);s=await p.evaluate(()=>JSON.parse(localStorage.getItem('ch6-self-test-v1')));const wrong=s.questions.find(question=>s.results.find(r=>r.questionId===question.id)?.status==='wrong');assert.deepEqual(s.results.map(r=>r.status),['correct','wrong','unanswered']);assert.match(await p.locator('main').innerText(),/正确率：50%/);await snap(p,'desktop-result');
  await p.reload({waitUntil:'networkidle'});assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('ch6-wrongbook-v1')).records[0].wrongCount),1);assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('ch6-notes-v2'))[0].text),'review note preserved');
  await select(p,'导出模板','空白重练');const blank=await download(p,'blank');assert(!blank.includes('错误唯一标记'));assert(!blank.includes(wrong.answer));assert(!wrong.analysis||!blank.includes(wrong.analysis));
  if(!skipPrint){const popup=await print(p,'blank-print-template');assert(!await popup.locator('body').innerText().then(t=>t.includes('错误唯一标记')||t.includes(wrong.answer)));await popup.close();}
  await p.getByRole('button',{name:/^错题本/}).click();await p.getByText('独立错题本',{exact:true}).waitFor();await snap(p,'desktop-wrongbook');await p.getByRole('button',{name:'勾选',exact:true}).click();await select(p,'导出范围','当前勾选');await select(p,'导出模板','对照纠错');const correction=await download(p,'correction');assert(correction.includes('错误唯一标记'));assert(correction.includes(wrong.answer));if(!skipPrint){const pc=await print(p,'correction-print-template');assert((await pc.locator('body').innerText()).includes('错误唯一标记'));await pc.close();}await select(p,'导出模板','简洁复习');const review=await download(p,'review');assert(!review.includes('错误唯一标记'));assert(review.includes(wrong.answer));if(!skipPrint){const pr=await print(p,'review-print-template');assert(!(await pr.locator('body').innerText()).includes('错误唯一标记'));assert((await pr.locator('body').innerText()).includes(wrong.answer));await pr.close();}
  await p.getByRole('button',{name:'重练此题（保存版本）',exact:true}).click();await p.getByRole('textbox',{name:'我的答案'}).fill(wrong.answer);await p.getByRole('button',{name:'交卷',exact:true}).click();await p.getByText('自测结果',{exact:true}).waitFor();await p.getByRole('button',{name:/^错题本/}).click();assert.match(await p.locator('main').innerText(),/累计答错 1 次/);await p.getByRole('button',{name:'移出错题本',exact:true}).click();await p.waitForFunction(()=>JSON.parse(localStorage.getItem('ch6-wrongbook-v1')).records.length===0);await c.close();
  findings.push('PASS generated fill-only exam, invalid/insufficient count, snapshot refresh, confirmation, 3 statuses, idempotency, notes, 3 download templates, blank print, reattempt retention, removal');

  const exercise=createSession([q('SC-03'),q('TF-01')],'catalog',1,'choice-judge');const mc=await context({'ch6-self-test-v1':exercise}, {width:393,height:851});
  await mc.p.getByRole('button',{name:/^A．/}).waitFor();await mc.p.getByRole('button',{name:/^B．/}).click();await mc.p.getByRole('button',{name:'下一题',exact:true}).click();await mc.p.getByRole('button',{name:/^F．/}).click();await snap(mc.p,'mobile-answering');assert.equal(await mc.p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await mc.p.getByRole('button',{name:'交卷',exact:true}).click();await mc.p.getByText('自测结果',{exact:true}).waitFor();await snap(mc.p,'mobile-result');assert.deepEqual(await mc.p.evaluate(()=>JSON.parse(localStorage.getItem('ch6-self-test-v1')).results.map(r=>r.status)),['correct','correct']);await mc.c.close();
  findings.push('PASS mobile 393px choice/judge answers, no horizontal overflow, results');

  if(!skipPrint){const oldMath={...q('Q-K14-01'),id:'old-math-snapshot',prompt:'旧版题目快照：长公式与图片\n\n$$'+Array.from({length:9},(_,i)=>'\\frac{'+(i+1)+'\\alpha_{cr}\\psi\\sigma_{sk}}{E_s}').join('+')+'$$\n\n![本地课件](/slides/slide-001.png)'};
  const mathSession=submitSession(answerSession(createSession([oldMath],'catalog',1,'math-s'),'old-math-snapshot','B'),2);const mathState=applySessionErrors(EMPTY_WRONGBOOK,mathSession);const mp=await context({'ch6-wrongbook-v1':mathState});await mp.p.getByRole('button',{name:/^错题本/}).click();await select(mp.p,'导出范围','全部错题');await select(mp.p,'导出模板','简洁复习');const pm=await print(mp.p,'math-image-print-template');assert(await pm.locator('.katex').count()>0);assert(await pm.locator('img').first().evaluate(image=>image.complete&&image.naturalWidth>0));assert.equal(await pm.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await pm.close();await mp.c.close();findings.push('PASS old snapshot formulas, long display scaling and loaded local image in print');}

  let submitted=submitSession(answerSession(createSession([q('FB-04')],'catalog',1,'recoverable'),'FB-04','错误唯一标记'),2);const book=applySessionErrors(EMPTY_WRONGBOOK,submitted);
  for(const kind of ['read','write']){
    const fixture=kind==='read'?book:EMPTY_WRONGBOOK;const fp=await context({'ch6-self-test-v1':submitted,'ch6-wrongbook-v1':fixture},undefined,{[kind]:true});await fp.p.getByRole('alert').filter({hasText:kind==='read'?'读取错题本失败':'错题本尚未保存'}).waitFor();await snap(fp.p,'storage-'+kind+'-failure');
    await fp.p.getByRole('button',{name:'重新组卷',exact:true}).click();const start=fp.p.getByRole('button',{name:'开始自测',exact:true});await start.waitFor();if(!await start.isDisabled())await start.click();await fp.p.getByRole('alert').filter({hasText:'最近结果尚未完整保存'}).waitFor();assert.equal(await fp.p.evaluate(()=>JSON.parse(localStorage.getItem('ch6-self-test-v1')).id),'recoverable');findings.push('PASS '+kind+' failure submitted recovery blocks starting replacement');
    await fp.p.evaluate(kind=>{if(kind==='read')window.__reviewReadFail=false;else window.__reviewWriteFail=false;},kind);await fp.p.getByRole('button',{name:kind==='read'?'重试读取':'重试保存',exact:true}).click();await fp.p.waitForFunction(()=>JSON.parse(localStorage.getItem('ch6-wrongbook-v1')).appliedSessionIds.includes('recoverable'));assert.equal(await fp.p.evaluate(()=>JSON.parse(localStorage.getItem('ch6-wrongbook-v1')).records[0].wrongCount),1);await fp.c.close();
  }
  if(!skipPrint){
    for(const failure of ['blocked','closed','timeout']){
      const fp=await context({'ch6-self-test-v1':submitted,'ch6-wrongbook-v1':book});let release;let hit;
      if(failure==='blocked')await fp.p.evaluate(()=>{window.open=()=>null;});
      else{
        await fp.p.evaluate(()=>{const opener=window;const open=window.open;window.open=function(...args){const pop=open.apply(this,args);if(pop){const listen=pop.addEventListener.bind(pop);pop.addEventListener=function(name,...handlers){if(name==='load'){opener.__reviewLoadHooked=true;return;}return listen(name,...handlers);};}return pop;};});
        if(failure==='timeout')await fp.p.evaluate(()=>{const timer=window.setTimeout;window.setTimeout=function(fn,ms,...args){return timer.call(this,fn,ms===30000?300:ms,...args);};});
        const popupWait=fp.p.waitForEvent('popup');await fp.p.getByRole('button',{name:'浏览器打印 / 另存为 PDF',exact:true}).click();const pop=await popupWait;await fp.p.waitForFunction(()=>window.__reviewLoadHooked,{},{timeout:3000});if(failure==='closed')await pop.close();
      }
      if(failure==='blocked')await fp.p.getByRole('button',{name:'浏览器打印 / 另存为 PDF',exact:true}).click();
      await fp.p.getByRole('alert').filter({hasText:failure==='blocked'?'浏览器拦住了打印窗口':failure==='closed'?'打印窗口已关闭':'打印窗口加载超时'}).waitFor();assert.equal(await fp.p.getByRole('button',{name:'浏览器打印 / 另存为 PDF',exact:true}).isEnabled(),true);await snap(fp.p,'print-'+failure+'-recovery');release?.();await fp.c.close();findings.push('PASS print '+failure+' error visible and controls recover');
    }
  }
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'qa-findings.json'),JSON.stringify({findings,errors},null,2));console.log(JSON.stringify({findings,errors,output:out},null,2));
}catch(e){for(const ctx of browser.contexts()){for(const page of ctx.pages()){console.log(JSON.stringify({url:page.url(),text:await page.locator('body').innerText().catch(()=>''),storage:await page.evaluate(()=>({...localStorage})).catch(()=>({})),errors}));await snap(page,'failed-page').catch(()=>{});}}await fs.writeFile(path.join(out,'qa-error.txt'),e.stack??String(e));throw e;}finally{await browser.close();}
