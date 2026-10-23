import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentStore } from '../src/lib/self-test/persistence.ts';
import { createSession, answerSession, submitSession, summarizeSession } from '../src/lib/self-test/model.ts';
import { decodeSession } from '../src/lib/self-test/store.ts';
import { applySessionErrors, EMPTY_WRONGBOOK } from '../src/lib/wrongbook/model.ts';
import { exportMarkdown } from '../src/lib/wrongbook/export.ts';

const q=(id,answer='正确答案',extra={})=>({id,type:'fill',prompt:'填空：____',options:[],answer,analysis:'解析唯一标记',verified:true,difficulty:'medium',...extra});
const deferred=()=>{let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('concurrent failed-load retries cannot overwrite later mutations',async()=>{
  const a=deferred(),b=deferred();let reads=0;const writes=[];
  const store=createPersistentStore({read(){reads++;if(reads===1)return Promise.reject(Error('blocked'));return reads===2?a.promise:b.promise;},async write(v){writes.push(v);}},0,'测试');
  await store.initialize();
  const ra=store.retry(),rb=store.retry();
  if(reads===2){a.resolve(20);await Promise.all([ra,rb]);await store.update(v=>v+1);}
  else{b.resolve(20);await rb;await store.update(v=>v+1);a.resolve(10);await ra;}
  assert.equal(store.getSnapshot().value,21);
  assert.deepEqual(writes,[21]);
});

test('read failure prohibits writing and successful retry recovers existing data',async()=>{
  let fail=true,writes=0;
  const store=createPersistentStore({async read(){if(fail)throw Error('bad');return {old:1};},async write(){writes++;}},{},'测试');
  assert.equal(await store.update(()=>({new:1})),false);assert.equal(writes,0);
  fail=false;await store.retry();assert.deepEqual(store.getSnapshot().value,{old:1});
});

test('older write success cannot clear newest failed-write state',async()=>{
  const old=deferred();let calls=0;
  const store=createPersistentStore({async read(){return 0;},async write(v){calls++;if(calls===1)await old.promise;else throw Error('quota');}},0,'测试');
  await store.initialize();const one=store.update(()=>1),two=store.update(()=>2);await Promise.resolve();
  old.resolve();await Promise.all([one,two]);
  assert.equal(store.getSnapshot().value,2);assert.equal(store.getSnapshot().dirty,true);assert.ok(store.getSnapshot().error);
});

test('grades three states and whitespace separately; submission and wrong counts idempotent',()=>{
  const qs=[q('right'),q('wrong'),q('long','很长的描述性答案需要人工核对语义不能仅凭子串判断内容是否等价'),q('blank')];
  let s=createSession(qs,'catalog',1,'s');
  for(const [id,ans]of [['right','正确答案'],['wrong','不正确'],['long','另一种解释'],['blank','   ']])s=answerSession(s,id,ans);
  s=submitSession(s,2);assert.deepEqual(s.results.map(r=>r.status),['correct','wrong','pending','unanswered']);
  assert.deepEqual(summarizeSession(s),{correct:1,wrong:1,pending:1,unanswered:1,total:4,answered:3,completion:.75,accuracy:.5});
  assert.equal(submitSession(s,3),s);const w=applySessionErrors(EMPTY_WRONGBOOK,s);assert.equal(w.records.length,1);assert.equal(w.records[0].wrongCount,1);assert.equal(applySessionErrors(w,s),w);
});

test('blank export source and output omit all personal answers, standard answers and analysis',()=>{
  const question=q('old','标准唯一标记',{prompt:'旧题干____'});
  const record={questionId:'old',question,lastWrongAnswer:'个人唯一标记',standardAnswer:question.answer,analysis:question.analysis,wrongCount:2,lastWrongAt:2,lastSessionId:'s'};
  const out=exportMarkdown([record],'blank','all',new Date(2026,9,20));
  assert.match(out.markdown,/旧题干/);assert.match(out.markdown,/作答：/);
  assert.doesNotMatch(out.markdown,/个人唯一标记|标准唯一标记|解析唯一标记/);assert.equal(out.filename,'2026-10-20-空白重练-1题.md');
});

test('corrupt optional grading metadata rejected at read rather than crashing submit',()=>{
  const s=createSession([q('bad','斜拉；斜压',{acceptedAnswers:['invalid-shape']})]);
  assert.throws(()=>decodeSession(s));
});
