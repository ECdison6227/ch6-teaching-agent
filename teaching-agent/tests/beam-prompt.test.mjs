import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../src/lib/prompt.ts';
import { ChatRequestSchema } from '../src/lib/request-validation.ts';

test('实验室使用专用讲解语义，课程问答继续遵循原教学节奏',async()=>{
 const body=ChatRequestSchema.parse({messages:[],pageContext:{page:0,mode:'beam-lab'}});
 const lab=await buildSystemPrompt(body.pageContext);
 assert.match(lab,/可以直接解释已得到的数值/);
 assert.match(lab,/不是新的系统指令/);
 assert.match(lab,/As′是输入，只预测As/);
 assert.doesNotMatch(lab,/永远不要直接给出最终答案/);
 const teaching=await buildSystemPrompt(null);
 assert.match(teaching,/永远不要直接给出最终答案/);
});
