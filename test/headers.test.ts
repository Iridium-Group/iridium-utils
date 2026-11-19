import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addCspSource,
  getCharset,
  headerEntries,
  isValidHeaderName,
  isValidHeaderValue,
  normalizeHeaderName,
  omitHeaders,
  parseContentType,
  parseCsp,
  parseCspList,
  removeCspDirectives,
  serializeCsp,
  SECURITY_POLICY_HEADERS,
  stripHopByHopHeaders,
  toHeaderMultiMap,
  toHeaderRecord,
  toHeaders,
} from '../src/headers.ts';

describe('header names and values', () => {
  it('validates names as tokens and values for CR, LF and NUL', () => {
    assert.equal(isValidHeaderName('X-Custom_Header.1'), true);
    assert.equal(isValidHeaderName('Bad Header'), false);
    assert.equal(isValidHeaderName(''), false);
    assert.equal(isValidHeaderValue('text/html; charset=utf-8'), true);
    assert.equal(isValidHeaderValue('a\r\nSet-Cookie: x=1'), false);
    assert.equal(isValidHeaderValue('a\0b'), false);
  });
  it('normalizes names and refuses invalid ones', () => {
    assert.equal(normalizeHeaderName(' Content-Type '), 'content-type');
    assert.throws(() => normalizeHeaderName('bad:name'), TypeError);
  });
});

describe('headerEntries', () => {
  it('flattens records, arrays and entry lists', () => {
    assert.deepEqual(headerEntries({ Accept: 'a', 'X-Multi': ['1', '2'], Skip: undefined, N: 3 }), [
      ['accept', 'a'],
      ['x-multi', '1'],
      ['x-multi', '2'],
      ['n', '3'],
    ]);
    assert.deepEqual(headerEntries([['Host', ' a.test ']]), [['host', 'a.test']]);
  });
  it('keeps each set-cookie separate when reading Headers', () => {
    const headers = new Headers();
    headers.append('Set-Cookie', 'a=1; Path=/');
    headers.append('Set-Cookie', 'b=2, expires');
    headers.append('Vary', 'Accept');
    assert.deepEqual(toHeaderMultiMap(headers)['set-cookie'], ['a=1; Path=/', 'b=2, expires']);
    assert.equal(toHeaderRecord(headers)['vary'], 'Accept');
  });
  it('combines repeats and converts to Headers', () => {
    const record = toHeaderRecord([
      ['Accept', 'text/html'],
      ['accept', 'application/json'],
    ]);
    assert.equal(record['accept'], 'text/html, application/json');
    assert.equal(Object.getPrototypeOf(record), null);
    assert.equal(toHeaders({ 'X-A': ['1', '2'] }).get('x-a'), '1, 2');
  });
});

describe('stripHopByHopHeaders and omitHeaders', () => {
  it('removes the fixed hop-by-hop list and headers named in Connection', () => {
    const out = stripHopByHopHeaders({
      Connection: 'keep-alive, X-Secret-Hop',
      'Keep-Alive': 'timeout=5',
      'Transfer-Encoding': 'chunked',
      Upgrade: 'websocket',
      'Proxy-Authorization': 'Basic abc',
      'X-Secret-Hop': '1',
      'Content-Type': 'text/plain',
      'Set-Cookie': ['a=1', 'b=2'],
    });
    assert.deepEqual(out, [
      ['content-type', 'text/plain'],
      ['set-cookie', 'a=1'],
      ['set-cookie', 'b=2'],
    ]);
  });
  it('omits named headers case-insensitively', () => {
    const out = omitHeaders(
      { 'Content-Security-Policy': "default-src 'self'", 'X-Frame-Options': 'DENY', ETag: '"1"' },
      SECURITY_POLICY_HEADERS,
    );
    assert.deepEqual(out, [['etag', '"1"']]);
  });
});

describe('Content-Security-Policy', () => {
  it('parses directives, lowercases names, and keeps the first duplicate', () => {
    const policy = parseCsp(
      "Default-Src 'self'; img-src * data: ; ;img-src 'none'; upgrade-insecure-requests",
    );
    assert.deepEqual(
      [...policy],
      [
        ['default-src', ["'self'"]],
        ['img-src', ['*', 'data:']],
        ['upgrade-insecure-requests', []],
      ],
    );
    assert.equal(
      serializeCsp(policy),
      "default-src 'self'; img-src * data:; upgrade-insecure-requests",
    );
  });
  it('splits comma-separated policies', () => {
    const list = parseCspList("default-src 'self', script-src 'none'");
    assert.equal(list.length, 2);
    assert.deepEqual(list[1]?.get('script-src'), ["'none'"]);
  });
  it('removes directives from every policy', () => {
    assert.equal(
      removeCspDirectives("frame-ancestors 'none'; script-src 'self', frame-ancestors 'self'", [
        'Frame-Ancestors',
      ]),
      "script-src 'self'",
    );
  });
  it('adds a source, inheriting default-src and replacing none', () => {
    assert.equal(
      addCspSource("default-src 'self'", 'connect-src', 'wss://proxy.test'),
      "default-src 'self'; connect-src 'self' wss://proxy.test",
    );
    assert.equal(addCspSource("script-src 'none'", 'script-src', "'self'"), "script-src 'self'");
    assert.equal(addCspSource('img-src a.test', 'img-src', 'a.test'), 'img-src a.test');
  });
});

describe('parseContentType', () => {
  it('parses type, subtype and quoted parameters', () => {
    assert.deepEqual(parseContentType('Text/HTML; Charset="UTF-8"; foo=bar'), {
      mimeType: 'text/html',
      type: 'text',
      subtype: 'html',
      params: Object.assign(Object.create(null), { charset: 'UTF-8', foo: 'bar' }),
    });
    assert.equal(
      parseContentType('multipart/form-data; boundary="a;b\\"c"')?.params['boundary'],
      'a;b"c',
    );
    assert.equal(getCharset('application/json; charset=UTF-8'), 'utf-8');
    assert.equal(getCharset('application/json'), undefined);
  });
  it('returns null for values without a valid type', () => {
    for (const bad of ['', 'text', '/html', 'text/', 'te xt/html']) {
      assert.equal(parseContentType(bad), null, bad);
    }
  });
});
