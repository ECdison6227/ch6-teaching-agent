import test from 'node:test';
import assert from 'node:assert/strict';
import { createFirstTurnGuide } from '../src/lib/first-turn-guide.ts';
import slides from '../src/content/slides.json' with {type:'json'};
const text={type:'text',delta:'先理解受力过程。'};
const card={type:'card',card:{kind:'data',topic:'K5',prompt:'填写条件',fields:[{key:'b',label:'宽度'}]}};
function run(messages,context,events){const output=[];const guide=createFirstTurnGuide(messages,context,e=>output.push(e));events.forEach(guide.emit);guide.finish();return output;}
const first=question=>[{role:'user',content:question}];
test('真实模型提前判题和出卡时，首轮仍先教学并使用真实课件索引',()=>{
 const output=run(first('判断这个梁会不会超筋'),null,[{type:'verdict',correct:false,topic:'K5'},text,card]);
 assert.deepEqual(output.map(e=>e.type),['text','figure']);
 assert.deepEqual(output[1].figure.pages,slides.filter(s=>s.section?.startsWith('K5 ')).map(s=>s.page));
});
test('漏发课件时补齐对应章节；已经发出的课件不重复发送',()=>{
 const output=run(first('讲讲双筋截面为何配置受压钢筋'),null,[text]);assert.ok(output[1].figure.pages.every(p=>slides.find(s=>s.page===p).section.startsWith('K6 ')));
 const figure={type:'figure',figure:{kind:'slide',page:76}};assert.deepEqual(run(first('双筋'),null,[figure,text]),[figure,text]);
});
test('后续作答保留判定与卡片，教材节和纯识图不编造 PPT',()=>{
 const verdict={type:'verdict',correct:true};assert.deepEqual(run([...first('双筋'),{role:'assistant',content:'已经讲解。'},{role:'user',content:'继续'}],null,[verdict,text,card]),[verdict,text,card]);
 assert.deepEqual(run(first('讲解'),{section:'K13 变形验算'},[{type:'text',delta:'与 K5 的计算不同。'}]).map(e=>e.type),['text']);
 assert.deepEqual(run(first('只读图片课程标题'),null,[text]),[text]);
});
test('上游报错或空回复时不追加看似成功的课件',()=>{
 const error={type:'error',message:'连接失败'};assert.deepEqual(run(first('双筋'),null,[text,error]),[text,error]);assert.deepEqual(run(first('双筋'),null,[]),[]);
});

test('模型结果讲解首轮直接解释真实结果，不追加课程PPT',()=>{
 const output=[];
 const guide=createFirstTurnGuide(first('讲解K5单筋模型预测1215.35'),{section:'K5 单筋矩形截面计算',mode:'beam-lab'},e=>output.push(e));
 assert.equal(guide.instruction,'');
 guide.emit({type:'text',delta:'模型预测1215.35，公式参考1212.38。'});guide.finish();
 assert.deepEqual(output.map(e=>e.type),['text']);
});
