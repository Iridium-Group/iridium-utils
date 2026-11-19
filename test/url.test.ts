import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatHostPort,
  getDefaultPort,
  getEffectivePort,
  isHttpUrl,
  isSameOrigin,
  isWebSocketUrl,
  normalizeUrl,
  parsePort,
  parseUrl,
  redactUrlCredentials,
  splitHostPort,
  withQuery,
} from '../src/url.ts';

describe('parseUrl', () => {
  it('returns a URL or null instead of throwing', () => {
    assert.equal(parseUrl('https://example.com/a')?.pathname, '/a');
    assert.equal(parseUrl('/b', 'https://example.com/a/')?.href, 'https://example.com/b');
    assert.equal(parseUrl('not a url'), null);
    assert.equal(parseUrl(''), null);
  });
  it('classifies http and websocket URLs', () => {
    assert.equal(isHttpUrl('https://example.com'), true);
    assert.equal(isHttpUrl('HTTP://example.com'), true);
    assert.equal(isHttpUrl('javascript:alert(1)'), false);
    assert.equal(isHttpUrl('ftp://example.com'), false);
    assert.equal(isWebSocketUrl('wss://example.com/wisp/'), true);
    assert.equal(isWebSocketUrl('https://example.com'), false);
  });
});

describe('ports', () => {
  it('knows default ports by scheme', () => {
    assert.equal(getDefaultPort('https:'), 443);
    assert.equal(getDefaultPort('WS'), 80);
    assert.equal(getDefaultPort('gopher:'), undefined);
    assert.equal(getEffectivePort(new URL('https://example.com')), 443);
    assert.equal(getEffectivePort(new URL('http://example.com:8080')), 8080);
  });
  it('parses ports strictly', () => {
    assert.equal(parsePort('443'), 443);
    assert.equal(parsePort(65535), 65535);
    for (const bad of ['0', '65536', '-1', '80a', '', '1e3', '123456']) {
      assert.equal(parsePort(bad), null, bad);
    }
  });
});

describe('normalizeUrl', () => {
  it('strips hash, credentials and trailing dots by default', () => {
    assert.equal(
      normalizeUrl('HTTPS://user:pw@Example.COM.:443/a/../b?x=1#frag'),
      'https://example.com/b?x=1',
    );
  });
  it('honours options', () => {
    assert.equal(
      normalizeUrl('http://a.test/?b=2&a=1#h', { sortQuery: true, stripHash: false }),
      'http://a.test/?a=1&b=2#h',
    );
    assert.equal(
      normalizeUrl('http://u:p@a.test/', { stripCredentials: false }),
      'http://u:p@a.test/',
    );
    assert.equal(normalizeUrl('nope'), null);
  });
  it('redacts credentials for logging', () => {
    assert.equal(redactUrlCredentials('https://u:secret@x.test/p'), 'https://x.test/p');
    assert.equal(redactUrlCredentials('https://x.test/p'), 'https://x.test/p');
    assert.equal(redactUrlCredentials('not a url'), 'not a url');
  });
});

describe('isSameOrigin', () => {
  it('compares scheme, host and effective port', () => {
    assert.equal(isSameOrigin('https://a.test/x', 'https://a.test:443/y'), true);
    assert.equal(isSameOrigin('https://a.test', 'http://a.test'), false);
    assert.equal(isSameOrigin('https://a.test', 'https://b.a.test'), false);
    assert.equal(isSameOrigin('data:text/plain,hi', 'data:text/plain,hi'), false);
    assert.equal(isSameOrigin('bad', 'https://a.test'), false);
  });
});

describe('withQuery', () => {
  it('sets, repeats and removes parameters', () => {
    assert.equal(
      withQuery('https://a.test/p?keep=1&drop=2', { drop: undefined, n: 5, tag: ['x', 'y'] }),
      'https://a.test/p?keep=1&n=5&tag=x&tag=y',
    );
    assert.equal(
      withQuery('https://a.test/?q=old', { q: 'new value' }),
      'https://a.test/?q=new+value',
    );
    assert.equal(withQuery('nope', { a: '1' }), null);
  });
});

describe('splitHostPort and formatHostPort', () => {
  it('splits names, IPv4 and bracketed IPv6', () => {
    assert.deepEqual(splitHostPort('example.com:8080'), { host: 'example.com', port: 8080 });
    assert.deepEqual(splitHostPort('example.com'), { host: 'example.com', port: undefined });
    assert.deepEqual(splitHostPort('10.0.0.1:22'), { host: '10.0.0.1', port: 22 });
    assert.deepEqual(splitHostPort('[::1]:443'), { host: '::1', port: 443 });
    assert.deepEqual(splitHostPort('[fe80::1]'), { host: 'fe80::1', port: undefined });
    assert.deepEqual(splitHostPort('2001:db8::1'), { host: '2001:db8::1', port: undefined });
  });
  it('rejects malformed input', () => {
    for (const bad of ['', ':80', 'host:', 'host:99999', '[::1', '[::1]x', '[nothex]:1', 'a:b:c']) {
      assert.equal(splitHostPort(bad), null, bad);
    }
  });
  it('brackets IPv6 when formatting', () => {
    assert.equal(formatHostPort('::1', 80), '[::1]:80');
    assert.equal(formatHostPort('[2001:DB8:0::1]'), '[2001:db8::1]');
    assert.equal(formatHostPort('example.com', 443), 'example.com:443');
  });
});
