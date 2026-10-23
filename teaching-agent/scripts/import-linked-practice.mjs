import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv[2] || path.join(app, '../../new-features/linked-practice'));
const read = name => JSON.parse(fs.readFileSync(path.join(source, name), 'utf8'));
const records = read('data/questions.structural-ready.json');
const byId = new Set(records.map(record => record.id));
if (records.length !== byId.size || records.some(record => record.structuralStatus !== 'ready' || record.issues.length))
  throw Error('关联练习仅接收结构清洗通过且ID唯一的记录');
const questions = records.map(record => ({
  id: record.id, contentHash: record.contentHash, topic: record.topic, type: record.type,
  prompt: record.prompt, options: record.options, answerRaw: record.answer.raw,
  answerValue: record.answer.value, analysis: record.analysis,
  category: record.category || record.sourceTags[1] || '综合应用',
  knowledge: record.knowledgeText,
  sourceLabel: record.provenance[0].sourceId === 'bank' ? '马跃题库' : '关联示范',
  sourceAlias: record.sourceLocalId, isAnchor: record.isAnchor === true,
}));
const relations = read('data/relations.resolved.json').map(relation => {
  if (!byId.has(relation.fromId) || !byId.has(relation.toId) || relation.blockReason) throw Error('关联端点不可用');
  return { id: relation.id, fromId: relation.fromId, toId: relation.toId, type: relation.type, label: relation.relationLabel, reason: relation.reason };
});
const summary = read('manifest.json');
const version = crypto.createHash('sha256').update(JSON.stringify([questions, relations])).digest('hex').slice(0, 16);
const output = path.join(app, 'src/features/linked-practice/content');
fs.mkdirSync(output, { recursive: true });
for (const [name, value] of Object.entries({
  questions, relations,
  manifest: { version, featureId: 'linked-practice', questionCount: questions.length, relationCount: relations.length,
    quarantinedCount: summary.counts.quarantined, blockedRelationCount: summary.counts.blockedRelations,
    sourceReview: 'source-only', sourceHashes: summary.sources.map(item => item.sha256),
    cleanedPackage: 'new-features/linked-practice', excludesOriginalQuestionBanks: true },
})) fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(value, null, 2) + '\n');
console.log(JSON.stringify({ version, questions: questions.length, relations: relations.length }));
