import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

/** UI checks use retained contract fixtures; live model contracts are verified separately. */
export async function beamLabBrowserCheck({ page, origin, basePath, output, navigate }) {
  const cases=JSON.parse(await fs.readFile(new URL('../tests/fixtures/beam/cases.json',import.meta.url),'utf8'));
  const samples=new Map(cases.slice(0,4).map(item=>[item.task,item]));
  let phase='normal', releasePending;
  const calls=[], explanations=[];
  const beamRoute=async route=>{
    const task=new URL(route.request().url()).pathname.split('/').at(-1);
    const sample=samples.get(task);
    assert.ok(sample,'Only known numerical tasks may be called');
    const input=route.request().postDataJSON(); calls.push({task,input});
    for(const [key,value] of Object.entries(sample.request)) assert.equal(input[key],value);
    if(phase==='blocked') await new Promise(resolve=>{releasePending=resolve;});
    await route.fulfill({status:phase==='unavailable'?503:200,contentType:'application/json',body:JSON.stringify(phase==='unavailable'?{error:'模型服务暂时不可用，请稍后重试。'}:sample.response)}).catch(()=>{});
  };
  const chatRoute=async route=>{
    explanations.push(route.request().postDataJSON());
    await route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify({type:'text',delta:'已读取本次模型结果，下面区分预测与公式参考。'})+'\n\ndata: '+JSON.stringify({type:'done'})+'\n\n'});
  };
  await page.route('**/api/beam/*',beamRoute);
  await page.route('**/api/chat',chatRoute);
  try {
    await page.goto(origin+basePath+'/beam-lab',{waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'智能配筋',exact:true}).waitFor();
    assert.equal(await page.locator('iframe[title="智能配筋实验室"]').count(),0);
    const names={design:'单筋设计',review:'单筋复核','double-a':'双筋设计 A','double-b':'双筋设计 B'};
    const expected={design:'1,215.35',review:'82.25','double-a':'3,903.33','double-b':'1,619.25'};
    for(const task of Object.keys(names)) {
      await page.getByRole('button',{name:names[task],exact:true}).click();
      const response=page.waitForResponse(r=>r.url().endsWith('/api/beam/'+task));
      await page.getByRole('button',{name:'开始计算',exact:true}).click();
      assert.equal((await response).status(),200);
      await page.getByText(expected[task],{exact:true}).waitFor();
      assert.equal(await page.getByRole('button',{name:'下载结果 JSON',exact:true}).isVisible(),true);
    }
    await page.getByRole('button',{name:'AI 讲解',exact:true}).click();
    await page.getByText('已读取本次模型结果，下面区分预测与公式参考。',{exact:true}).filter({visible:true}).waitFor();
    assert.equal(explanations.length,1);
    assert.equal(explanations[0].pageContext.mode,'beam-lab');
    assert.match(JSON.stringify(explanations[0].messages),/1619\.245243/);
    await page.getByRole('button',{name:'收起',exact:true}).click();
    await navigate('资料下载');
    await page.getByRole('heading',{name:'资料下载',exact:true}).waitFor();
    assert.equal(await page.locator('iframe[title="智能配筋实验室"]').count(),0);
    await navigate('智能配筋');
    await page.getByText('1,619.25',{exact:true}).waitFor();
    assert.equal(await page.getByRole('spinbutton',{name:'给定受压钢筋面积 As′（mm²）',exact:true}).inputValue(),'500');
    await page.screenshot({path:path.join(output,'beam-lab-kimi-result.png'),fullPage:true});
    phase='unavailable';
    await page.getByRole('button',{name:'开始计算',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'本次计算未完成'}).waitFor();
    assert.equal(await page.getByText('1,619.25',{exact:true}).count(),0);
    phase='normal';
    await page.getByRole('button',{name:'修改后重试',exact:true}).click();
    await page.getByText('1,619.25',{exact:true}).waitFor();
    phase='blocked';
    await page.getByRole('button',{name:'开始计算',exact:true}).click();
    await page.getByRole('button',{name:'取消计算',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'已取消'}).waitFor();
    releasePending?.(); phase='normal';
    assert.equal(await page.getByRole('spinbutton',{name:'给定受压钢筋面积 As′（mm²）',exact:true}).inputValue(),'500');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    assert.equal(overflow,false,'Beam lab must not overflow its viewport');
    assert.ok(calls.length>=6);
    console.log('PASS beam lab: independent navigation, four tasks, actual-result AI context, retained form/results, no materials iframe, failure/retry and cancel');
  } finally {
    releasePending?.();
    await page.unroute('**/api/beam/*',beamRoute);
    await page.unroute('**/api/chat',chatRoute);
  }
}
