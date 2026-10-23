import {chromium} from 'playwright';
import {getQuestionCatalog} from '../src/lib/question-catalog.ts';
import {createSession,answerSession,submitSession} from '../src/lib/self-test/model.ts';
const q=getQuestionCatalog().find(q=>q.id==='FB-04');const s=submitSession(answerSession(createSession([q]),q.id,'错误'),2);
const b=await chromium.launch();const c=await b.newContext();await c.addInitScript(s=>{localStorage.setItem('ch6-self-test-v1',JSON.stringify(s));const open=window.open;window.open=function(...args){const w=open.apply(this,args);if(w)w.print=()=>w.__reviewPrinted=true;return w;};},s);
const p=await c.newPage();await p.goto('http://127.0.0.1:3171/self-test',{waitUntil:'networkidle'});const waiting=p.waitForEvent('popup');await p.getByRole('button',{name:'浏览器打印 / 另存为 PDF',exact:true}).click();const popup=await waiting;await popup.waitForTimeout(2000);console.log(await popup.evaluate(()=>({ready:document.readyState,fonts:document.fonts.status,printed:window.__reviewPrinted,print:String(window.print),images:[...document.images].map(i=>i.complete)})));console.log('main preparing:',await p.getByRole('button',{name:'准备打印…',exact:true}).count());await b.close();
