import { cleanTag, documentStatuses, hasType, isTypeId, joinTags, standardType, tagKey, typeLabel, type DocumentStatus, type TaggedKind } from '../shared/tags';

/**
 * Version 1 of `tags.json` stored 44 standard tags in six groups (Type, Area, Audience, Language,
 * Status, Style) beside custom tags. This vocabulary exists only to read those files; version 2
 * keeps Type, moves Status to its own field, derives Language, and keeps every other tag as a
 * custom tag with its display label, so no information is lost.
 */
type LegacyGroup = 'type' | 'area' | 'audience' | 'language' | 'status' | 'style';
const legacy: [LegacyGroup, string, string, string[]?][] = [
  ['type', 'report', 'Report'], ['type', 'proposal', 'Proposal'], ['type', 'brief', 'Brief'], ['type', 'plan', 'Plan'],
  ['type', 'minutes', 'Minutes', ['meeting minutes']], ['type', 'memo', 'Memo', ['memorandum']], ['type', 'letter', 'Letter'],
  ['type', 'policy', 'Policy'], ['type', 'guide', 'Guide', ['manual', 'handbook']], ['type', 'invoice', 'Invoice'],
  ['type', 'quotation', 'Quotation', ['quote']], ['type', 'contract', 'Contract', ['agreement']], ['type', 'cv', 'CV', ['resume', 'résumé']],
  ['type', 'profile', 'Profile', ['company profile']], ['type', 'newsletter', 'Newsletter'], ['type', 'case-study', 'Case study'],
  ['type', 'pitch', 'Pitch', ['pitch deck']], ['type', 'training', 'Training'],
  ['area', 'finance', 'Finance'], ['area', 'operations', 'Operations'], ['area', 'strategy', 'Strategy'], ['area', 'marketing', 'Marketing'],
  ['area', 'sales', 'Sales'], ['area', 'product', 'Product'], ['area', 'research', 'Research'], ['area', 'hr', 'HR', ['human resources']],
  ['area', 'legal', 'Legal'], ['area', 'technical', 'Technical'],
  ['audience', 'internal', 'Internal'], ['audience', 'client', 'Client', ['customer']], ['audience', 'executive', 'Executive', ['leadership', 'board']], ['audience', 'public', 'Public'],
  ['language', 'english', 'English'], ['language', 'arabic', 'Arabic', ['العربية']], ['language', 'bilingual', 'Bilingual'],
  ['status', 'draft', 'Draft'], ['status', 'in-review', 'In review', ['review']], ['status', 'final', 'Final'], ['status', 'archived', 'Archived'],
  ['style', 'formal', 'Formal'], ['style', 'minimal', 'Minimal'], ['style', 'editorial', 'Editorial'], ['style', 'bold', 'Bold'], ['style', 'playful', 'Playful'],
];
interface LegacyTag { group: LegacyGroup; id: string; label: string }
const legacyByKey = new Map<string, LegacyTag>();
for (const [group, id, label, aliases = []] of legacy) for (const key of [id, label, ...aliases]) legacyByKey.set(tagKey(key), { group, id, label });

/** Every version 1 standard tag ID, for tests and diagnostics. */
export const legacyStandardTags = legacy.map(([group, id, label]) => ({ group, id, label }));

/** The most advanced status wins when an item carried several. */
const statusRank = new Map<DocumentStatus, number>(documentStatuses.map((item, index) => [item.id, index]));

/**
 * Migrate one item's version 1 tags, in order:
 * - The first Type tag with a version 2 type becomes the item's type (documents and templates).
 *   Later Type tags naming the same type are merged; others become custom tags with their label.
 * - Status tags on a document become its status, the most advanced winning (archived, final,
 *   in review, draft). On themes and templates they become custom tags.
 * - Language tags are dropped: language is now derived from the item itself.
 * - Area, Audience, and Style tags, and Type tags without a version 2 type (Contract) or on a
 *   theme, become custom tags with their display label.
 * - Custom tags are kept. A custom tag spelled like a version 2 type ID becomes the type when the
 *   item has none, so no tag changes meaning.
 */
export function migrateItemTags(kind: TaggedKind, values: readonly string[]) {
  const typed = hasType(kind);
  let type: string | undefined;
  let status: DocumentStatus | undefined;
  const custom = new Map<string, string>();
  const addCustom = (text: string) => { const key = tagKey(text); if (!custom.has(key) && key !== type) custom.set(key, text); };
  for (const value of values) {
    const cleaned = cleanTag(value);
    if (!cleaned) continue;
    const old = legacyByKey.get(tagKey(cleaned));
    if (!old) {
      // A custom tag that is exactly a new type ID (only `article`) names that type.
      if (typed && isTypeId(cleaned) && !type) { type = cleaned; custom.delete(cleaned); }
      else addCustom(isTypeId(cleaned) ? typeLabel(cleaned) : cleaned);
      continue;
    }
    if (old.group === 'language') continue;
    if (old.group === 'status' && kind === 'documents') {
      const next = old.id as DocumentStatus;
      if (!status || statusRank.get(next)! > statusRank.get(status)!) status = next;
      continue;
    }
    const mapped = old.group === 'type' && typed ? standardType(old.id)?.id : undefined;
    if (mapped && !type) { type = mapped; custom.delete(mapped); continue; }
    if (mapped && mapped === type) continue;
    addCustom(old.label);
  }
  return { tags: joinTags(type, [...custom.values()]), ...(status ? { status } : {}) };
}
