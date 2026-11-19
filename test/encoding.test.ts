import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EncodingError,
  URL_CODECS,
  base64Decode,
  base64DecodeBytes,
  base64Encode,
  base64UrlDecode,
  base64UrlDecodeBytes,
  base64UrlEncode,
  concatBytes,
  getUrlCodec,
  hexDecode,
  hexEncode,
  timingSafeEqual,
  utf8Decode,
  utf8Encode,
  xorDecode,
  xorEncode,
} from '../src/encoding.ts';

const bytes = (...values: number[]) => new Uint8Array(values);

describe('utf8', () => {
  it('round-trips non-ASCII text', () => {
    const text = 'héllo, 世界 🌏';
    assert.equal(utf8Decode(utf8Encode(text)), text);
    assert.deepEqual(utf8Encode('é'), bytes(0xc3, 0xa9));
  });
  it('replaces or rejects invalid sequences', () => {
    assert.equal(utf8Decode(bytes(0x61, 0xff)), 'a\uFFFD');
    assert.throws(() => utf8Decode(bytes(0xff), { fatal: true }), EncodingError);
  });
});

describe('base64', () => {
  it('matches the RFC 4648 test vectors', () => {
    const vectors: Array<[string, string]> = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='],
      ['fooba', 'Zm9vYmE='],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [plain, encoded] of vectors) {
      assert.equal(base64Encode(plain), encoded, plain);
      assert.equal(base64Decode(encoded), plain, encoded);
    }
  });
  it('encodes strings as UTF-8 and handles every byte value', () => {
    assert.equal(base64Encode('✓'), '4pyT');
    assert.equal(base64Decode('4pyT'), '✓');
    const all = new Uint8Array(256).map((_, i) => i);
    assert.deepEqual(base64DecodeBytes(base64Encode(all)), all);
  });
  it('encodes large inputs without overflowing the call stack', () => {
    const big = new Uint8Array(200_000).fill(0x41);
    assert.equal(base64DecodeBytes(base64Encode(big)).length, 200_000);
  });
  it('accepts whitespace and missing padding, rejects garbage', () => {
    assert.equal(base64Decode('Zm9v\nYg'), 'foob');
    for (const bad of ['Zm9v!', 'Z', 'Zg=', 'Zg===', '=Zg=']) {
      assert.throws(() => base64DecodeBytes(bad), EncodingError, bad);
    }
  });
  it('base64url uses - and _ without padding', () => {
    const data = bytes(0xfb, 0xff, 0xbf);
    assert.equal(base64Encode(data), '+/+/');
    assert.equal(base64UrlEncode(data), '-_-_');
    assert.deepEqual(base64UrlDecodeBytes('-_-_'), data);
    assert.equal(base64UrlEncode('f'), 'Zg');
    assert.equal(base64UrlDecode('Zg'), 'f');
    assert.throws(() => base64UrlDecodeBytes('+/+/'), EncodingError);
  });
});

describe('hex', () => {
  it('round-trips bytes and strings', () => {
    assert.equal(hexEncode(bytes(0, 15, 16, 255)), '000f10ff');
    assert.deepEqual(hexDecode('000F10ff'), bytes(0, 15, 16, 255));
    assert.equal(hexEncode('hi'), '6869');
  });
  it('rejects odd length and non-hex characters', () => {
    assert.throws(() => hexDecode('abc'), EncodingError);
    assert.throws(() => hexDecode('zz'), EncodingError);
  });
});

describe('byte helpers', () => {
  it('concatenates', () => {
    assert.deepEqual(concatBytes(bytes(1), bytes(), bytes(2, 3)), bytes(1, 2, 3));
  });
  it('compares in constant time for equal lengths', () => {
    assert.equal(timingSafeEqual(bytes(1, 2, 3), bytes(1, 2, 3)), true);
    assert.equal(timingSafeEqual(bytes(1, 2, 3), bytes(1, 2, 4)), false);
    assert.equal(timingSafeEqual(bytes(1, 2), bytes(1, 2, 3)), false);
  });
});

describe('URL codecs', () => {
  it('xor matches the common proxy codec output', () => {
    assert.equal(xorEncode('https://example.com/'), 'hvtrs8%2F-ezaopne%2Ccmm-');
    assert.equal(xorDecode('hvtrs8%2F-ezaopne%2Ccmm-'), 'https://example.com/');
  });
  it('xor keeps an appended query string and supports other keys', () => {
    assert.equal(xorDecode(`${xorEncode('https://a.test/')}?proxy=1`), 'https://a.test/?proxy=1');
    assert.equal(xorDecode(xorEncode('https://a.test/x', 7), 7), 'https://a.test/x');
    assert.throws(() => xorDecode('%E0%A4%A'), EncodingError);
  });
  it('every built-in codec round-trips URLs with unicode and reserved characters', () => {
    const url = 'https://例え.テスト/path?q=a b&x=%20#frag';
    for (const codec of Object.values(URL_CODECS)) {
      assert.equal(codec.decode(codec.encode(url)), url, codec.name);
    }
    assert.match(URL_CODECS.base64.encode(url), /^[A-Za-z0-9_-]+$/);
  });
  it('looks codecs up by name', () => {
    assert.equal(getUrlCodec('xor').name, 'xor');
    assert.throws(() => getUrlCodec('rot13'), EncodingError);
    assert.throws(() => getUrlCodec('toString'), EncodingError);
  });
});
