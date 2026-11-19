import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  JsonError,
  isPlainObject,
  jsonDepth,
  parseJson,
  safeJsonParse,
  safeJsonStringify,
  tryParseJson,
} from '../src/json.ts';

describe('jsonDepth', () => {
  it('counts nesting and ignores brackets inside strings', () => {
    assert.equal(jsonDepth('1'), 0);
    assert.equal(jsonDepth('{"a":[1,{"b":[]}]}'), 4);
    assert.equal(jsonDepth('{"a":"[[[{{{\\"]]]"}'), 1);
  });
});

describe('parseJson', () => {
  it('parses ordinary JSON', () => {
    assert.deepEqual(parseJson('{"a":[1,"two",null,true]}'), { a: [1, 'two', null, true] });
    assert.equal(parseJson('"x"'), 'x');
  });
  it('rejects input over maxLength before parsing', () => {
    assert.throws(
      () => parseJson('[1,2,3]', { maxLength: 5 }),
      (e: unknown) => e instanceof JsonError && e.code === 'TOO_LARGE',
    );
  });
  it('rejects nesting over maxDepth before parsing', () => {
    const deep = '['.repeat(100_000) + ']'.repeat(100_000);
    assert.throws(
      () => parseJson(deep, { maxLength: Infinity }),
      (e: unknown) => e instanceof JsonError && e.code === 'TOO_DEEP',
    );
    assert.deepEqual(parseJson('[[1]]', { maxDepth: 2 }), [[1]]);
    assert.throws(() => parseJson('[[[1]]]', { maxDepth: 2 }), JsonError);
  });
  it('wraps syntax errors as INVALID', () => {
    const result = safeJsonParse('{bad}');
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'INVALID');
    assert.ok(!result.ok && result.error.cause instanceof SyntaxError);
  });
  it('drops __proto__, constructor and prototype keys by default', () => {
    const value = parseJson<Record<string, unknown>>(
      '{"__proto__":{"polluted":true},"a":{"constructor":{"prototype":{"x":1}},"ok":1}}',
    );
    assert.deepEqual(Object.keys(value), ['a']);
    assert.deepEqual(value['a'], { ok: 1 });
    const merged = Object.assign({}, value);
    assert.equal((merged as Record<string, unknown>)['polluted'], undefined);
    assert.equal(({} as Record<string, unknown>)['polluted'], undefined);
  });
  it('can throw on or keep unsafe keys', () => {
    assert.throws(
      () => parseJson('{"x":{"__proto__":1}}', { unsafeKeys: 'throw' }),
      (e: unknown) => e instanceof JsonError && e.code === 'UNSAFE_KEY',
    );
    const kept = parseJson<object>('{"__proto__":1}', { unsafeKeys: 'keep' });
    assert.equal(Object.hasOwn(kept, '__proto__'), true);
  });
  it('does not treat array elements or values named like unsafe keys as unsafe', () => {
    assert.deepEqual(parseJson('["__proto__","constructor"]'), ['__proto__', 'constructor']);
    assert.deepEqual(parseJson('{"name":"prototype"}'), { name: 'prototype' });
  });
});

describe('safeJsonParse and tryParseJson', () => {
  it('return results instead of throwing', () => {
    assert.deepEqual(safeJsonParse('[1]'), { ok: true, value: [1] });
    assert.equal(tryParseJson('nope', 'fallback'), 'fallback');
    assert.deepEqual(tryParseJson('{"a":1}', {}), { a: 1 });
  });
});

describe('safeJsonStringify', () => {
  it('replaces cycles but writes shared references in full', () => {
    const shared = { n: 1 };
    const root: Record<string, unknown> = { a: shared, b: shared };
    root['self'] = root;
    assert.equal(safeJsonStringify(root), '{"a":{"n":1},"b":{"n":1},"self":"[Circular]"}');
    const list: unknown[] = [1];
    list.push(list);
    assert.equal(safeJsonStringify(list, { circular: '<cycle>' }), '[1,"<cycle>"]');
  });
  it('stringifies BigInt and unserializable top-level values', () => {
    assert.equal(safeJsonStringify({ n: 10n ** 20n }), '{"n":"100000000000000000000"}');
    assert.equal(safeJsonStringify(undefined), 'null');
    assert.equal(safeJsonStringify({ a: 1 }, { space: 2 }), '{\n  "a": 1\n}');
  });
});

describe('isPlainObject', () => {
  it('accepts object literals and null-prototype objects only', () => {
    assert.equal(isPlainObject({}), true);
    assert.equal(isPlainObject(Object.create(null)), true);
    assert.equal(isPlainObject([]), false);
    assert.equal(isPlainObject(new Date()), false);
    assert.equal(isPlainObject(null), false);
  });
});
