import { describe, expect, it } from 'vitest';
import type { Book, BookEntry, Config } from '../src/api';
import { bookSearchText, bookUnchanged, changedBookFields, draftChanged, makeBookDraft, matchingBookEntries, newEntry, replaceBook, serializeBookDraft } from '../src/pages/book-utils';

function entry(uid = 0): BookEntry {
  return { uid, comment: `条目 ${uid}`, key: ['港口'], keysecondary: ['潮汐'], content: '全文中才能查到的灯塔', constant: false, selective: true, useProbability: true, disable: false, selectiveLogic: 0, probability: 100, order: 100, position: 0, scanDepth: 5, extensions: { x: 1, y: 2, nullable: null }, unknown: { keep: true } };
}
function book(): Book {
  return { id: 'synthetic-book', name: '虚构世界书', keys: [], content: '', entries: [entry()], source: { id: 'synthetic', repository: 'synthetic-source', commit: 'synthetic-version', license: 'synthetic-license', attribution: '虚构作者', adaptation: '测试' }, opaqueBookField: { retained: true } };
}
function config(value = book()): Config {
  return { version: 4, books: [value], roles: [], preset: { context: 8192, maxTokens: 512, temperature: 0.7, pinExamples: false, postHistory: '' }, acceptNew: true, paused: false, model: null, planBackend: { enabled: false, model: 'synthetic', reasoningEffort: 'medium' } };
}

describe('world book drafts', () => {
  it('round trips all original source, unknown fields, nulls and nested extensions without mutation', () => {
    const original = book(), before = structuredClone(original), base = config(original);
    const draft = makeBookDraft(original, base);
    expect(draftChanged(draft)).toBe(false);
    expect(serializeBookDraft(draft)).toEqual(original);
    draft.entries![0].entry.content = '新的全文';
    const result = serializeBookDraft(draft);
    expect(result.source).toEqual(original.source);
    expect(result.opaqueBookField).toEqual(original.opaqueBookField);
    expect(result.entries![0].unknown).toEqual(original.entries![0].unknown);
    expect(result.entries![0].extensions).toEqual(original.entries![0].extensions);
    expect(original).toEqual(before);
    expect(base.version).toBe(4);
  });

  it('applies explicit top-level deletion, nested deletion and renamed extension keys', () => {
    const original = book(), draft = makeBookDraft(original, config(original));
    const extra = JSON.parse(draft.entries![0].extra);
    delete extra.scanDepth;
    delete extra.extensions.x;
    extra.extensions.z = 1;
    draft.entries![0].extra = JSON.stringify(extra);
    const saved = serializeBookDraft(draft).entries![0];
    expect(saved).not.toHaveProperty('scanDepth');
    expect(saved.extensions).toEqual({ y: 2, nullable: null, z: 1 });
    expect(saved.unknown).toEqual({ keep: true });
    expect(original.entries![0].extensions).toEqual({ x: 1, y: 2, nullable: null });
  });

  it('can explicitly clear all extra fields while retaining the common entry fields', () => {
    const original = book(), draft = makeBookDraft(original, config(original));
    draft.entries![0].extra = '{}';
    const saved = serializeBookDraft(draft).entries![0];
    expect(saved.content).toBe(original.entries![0].content);
    expect(saved.uid).toBe(0);
    expect(saved).not.toHaveProperty('extensions');
    expect(saved).not.toHaveProperty('unknown');
  });

  it('preserves the distinction between a simple book and an empty entries book', () => {
    const simple: Book = { id: 'simple', name: '简单书', keys: ['海港'], content: '完整简单正文', opaque: { keep: true } };
    expect(serializeBookDraft(makeBookDraft(simple, config(simple)))).toEqual(simple);
    expect(serializeBookDraft(makeBookDraft(simple, config(simple)))).not.toHaveProperty('entries');
    const empty = { ...simple, entries: [] };
    expect(serializeBookDraft(makeBookDraft(empty, config(empty))).entries).toEqual([]);
  });

  it('treats both field edits and raw JSON edits as unsaved changes', () => {
    const original = book(), draft = makeBookDraft(original, config(original));
    draft.entries![0].secondary = '另一条件';
    expect(draftChanged(draft)).toBe(true);
    const another = makeBookDraft(original, config(original));
    another.entries![0].extra = '{}';
    expect(draftChanged(another)).toBe(true);
    expect(draftChanged(makeBookDraft(original, config(original), true))).toBe(true);
  });
});

describe('conflict review and optimistic saves', () => {
  it('only permits a newer configuration version retry when the entire server book is unchanged', () => {
    const original = book();
    expect(bookUnchanged(original, structuredClone(original))).toBe(true);
    expect(bookUnchanged(original, undefined)).toBe(false);
    for (const field of ['probability', 'position', 'order', 'disable']) {
      const latest = structuredClone(original);
      latest.entries![0][field] = field === 'disable' ? true : 4;
      expect(bookUnchanged(original, latest)).toBe(false);
    }
  });

  it('detects a server-side entry reorder even when local edits only changed the book name', () => {
    const original = book(); original.entries!.push(entry(1));
    const local = makeBookDraft(original, config(original)); local.book.name = '本地改名';
    const latest = structuredClone(original); latest.entries!.reverse();
    expect(bookUnchanged(local.original, latest)).toBe(false);
    expect(changedBookFields(original, latest)).toContain('entries[0].uid');
    expect(serializeBookDraft(local).name).toBe('本地改名');
    expect(latest.entries!.map(item => item.uid)).toEqual([1, 0]);
  });

  it('reports trigger, advanced, unknown and removed fields in the complete version comparison', () => {
    const original = book(), latest = structuredClone(original);
    latest.entries![0].probability = 10;
    latest.entries![0].key = ['新关键词'];
    latest.entries![0].extensions = { y: 2, nullable: null };
    delete latest.entries![0].unknown;
    latest.opaqueBookField = { retained: false };
    expect(changedBookFields(original, latest)).toEqual(expect.arrayContaining([
      'entries[0].probability', 'entries[0].key[0]', 'entries[0].extensions.x', 'entries[0].unknown', 'opaqueBookField.retained',
    ]));
  });

  it('retains the original expected version and unrelated configuration fields', () => {
    const original = book(), base = config(original);
    const draft = makeBookDraft(original, base);
    draft.book.name = '草稿名称';
    const next = replaceBook(draft.base, serializeBookDraft(draft));
    expect(next.version).toBe(4);
    expect(next.preset).toEqual(base.preset);
    expect(next.books[0].name).toBe('草稿名称');
    expect(base.books[0].name).toBe('虚构世界书');
  });
});

describe('server capability limits', () => {
  it.each([
    '{"extension":900719925474099312345}',
    '{"extension":9007199254740993}',
    '{"extension":9007199254740992}',
    '{"extension":1e400}',
    '{"extension":1e-999}',
    '{"extension":0.10000000000000001}',
    '{"extension":-0.10000000000000001}',
    '{"extension":-0}',
    '{"extension":{"nested":[1,2,1.234567890123456789]}}',
  ])('rejects lossy numeric conversion and leaves the exact input draft untouched: %s', extra => {
    const original = book(), before = structuredClone(original), draft = makeBookDraft(original, config(original));
    draft.entries![0].extra = extra;
    expect(() => serializeBookDraft(draft)).toThrow('数值无法无损保存');
    expect(draft.entries![0].extra).toBe(extra);
    expect(original).toEqual(before);
    expect(draft.entries![0].entry.unknown).toEqual(before.entries![0].unknown);
  });

  it.each([
    ['0.1', 0.1],
    ['1e3', 1000],
    ['1.2300e3', 1230],
    ['1.0000000000000000', 1],
    ['-12.75', -12.75],
    ['1e-7', 1e-7],
    ['0.000000000000000001', 1e-18],
    ['0e000000000000000000000000000001', 0],
    ['9007199254740991', 9007199254740991],
  ] as const)('allows an exactly round-tripping ordinary JSON number %s', (literal, expected) => {
    const original = book(), draft = makeBookDraft(original, config(original));
    const extra = `{ "extension": ${literal}, "unrelated": { "keep": true } }`;
    draft.entries![0].extra = extra;
    const saved = serializeBookDraft(draft).entries![0];
    expect(saved.extension).toBe(expected);
    expect(saved.unrelated).toEqual({ keep: true });
    expect(saved.content).toBe(original.entries![0].content);
    expect(draft.entries![0].extra).toBe(extra);
  });

  it.each([
    '{"duplicate":"first","duplicate":"last"}',
    '{"a":1,"\\u0061":2}',
    '{"extension":{"nested":1,"nested":2}}',
  ])('refuses duplicate-key business saves rather than silently dropping a field: %s', extra => {
    const original = book(), draft = makeBookDraft(original, config(original));
    draft.entries![0].extra = extra;
    expect(() => serializeBookDraft(draft)).toThrow('重复键');
    expect(draft.entries![0].extra).toBe(extra);
    expect(original.entries![0].unknown).toEqual({ keep: true });
  });

  it('allows the same key in different objects, numeric-looking strings and unknown extensions without mutation', () => {
    const original = book(), draft = makeBookDraft(original, config(original));
    const extra = '{"a":1,"child":{"a":2},"exactId":"900719925474099312345","scientificLabel":"1e400","unknown":{"keep":true}}';
    draft.entries![0].extra = extra;
    const saved = serializeBookDraft(draft).entries![0];
    expect(saved.child).toEqual({ a: 2 });
    expect(saved.exactId).toBe('900719925474099312345');
    expect(saved.scientificLabel).toBe('1e400');
    expect(saved.unknown).toEqual(original.entries![0].unknown);
    expect(draft.entries![0].extra).toBe(extra);
  });

  it('rejects a very long underflow exponent without constructing a huge BigInt or changing source', () => {
    const original = book(), draft = makeBookDraft(original, config(original));
    const extra = `{"extension":1e-${'9'.repeat(100_000)}}`;
    draft.entries![0].extra = extra;
    expect(() => serializeBookDraft(draft)).toThrow('下溢为 0');
    expect(draft.entries![0].extra).toBe(extra);
    expect(original.entries![0].unknown).toEqual({ keep: true });
  });

  it('searches actual full entry content and secondary trigger keywords', () => {
    const value = book();
    expect(bookSearchText(value)).toContain('全文中才能查到的灯塔');
    expect(bookSearchText(value)).toContain('潮汐');
  });

  it('locates a unique body match in the ninetieth entry and matches secondary keywords', () => {
    const value = book(); value.entries = Array.from({ length: 100 }, (_, index) => ({ ...entry(index), content: index === 89 ? '唯一的灯塔暗号' : '普通内容' }));
    expect(matchingBookEntries(value, '灯塔暗号')).toEqual([89]);
    expect(matchingBookEntries(value, '潮汐')).toHaveLength(100);
    expect(matchingBookEntries(value, '')).toEqual([]);
    expect(matchingBookEntries(value, '不存在')).toEqual([]);
  });

  it.each([0, 1, 4, 5, 6])('allows supported injection position %i', position => {
    const original = book(), draft = makeBookDraft(original, config(original));
    draft.entries![0].entry.position = position;
    expect(serializeBookDraft(draft).entries![0].position).toBe(position);
  });

  it.each([2, 3, 7])('rejects unsupported injection position %i and preserves the input draft', position => {
    const original = book(), draft = makeBookDraft(original, config(original));
    draft.entries![0].entry.position = position;
    expect(() => serializeBookDraft(draft)).toThrow('注入位置');
    expect(draft.entries![0].entry.position).toBe(position);
  });

  it.each(['vectorized', 'automationId', 'outletName'])('rejects unsupported %s configuration', field => {
    const original = book(), draft = makeBookDraft(original, config(original));
    draft.entries![0].extra = JSON.stringify({ [field]: true });
    expect(() => serializeBookDraft(draft)).toThrow('不支持向量');
  });

  it('rejects invalid JSON, reserved/common field overrides, length and probability errors', () => {
    const original = book();
    for (const extra of ['[]', '{', '{"uid":6}', '{"extensions":{"__proto__":{}}}']) {
      const draft = makeBookDraft(original, config(original)); draft.entries![0].extra = extra;
      expect(() => serializeBookDraft(draft)).toThrow();
    }
    const long = makeBookDraft(original, config(original)); long.entries![0].entry.content = 'a'.repeat(24001);
    expect(() => serializeBookDraft(long)).toThrow('24,000');
    const invalid = makeBookDraft(original, config(original)); invalid.entries![0].entry.probability = Number.NaN;
    expect(() => serializeBookDraft(invalid)).toThrow('概率');
    const keyword = makeBookDraft(original, config(original)); keyword.entries![0].keys = 'a'.repeat(201);
    expect(() => serializeBookDraft(keyword)).toThrow('200');
  });

  it('allocates a non-colliding local UID for a new entry', () => {
    const value = book(), draft = makeBookDraft(value, config(value));
    expect(newEntry([]).uid).toBe(0);
    expect(newEntry(draft.entries!).uid).toBe(1);
    draft.entries![0].entry.uid = Number.MAX_SAFE_INTEGER;
    expect(newEntry(draft.entries!).uid).toBe(0);
  });
});
