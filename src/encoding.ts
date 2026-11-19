/**
 * Byte and string codecs: UTF-8, base64, base64url, hex, and the URL codecs used by web proxies.
 * Uses only `TextEncoder`, `TextDecoder`, `btoa` and `atob`, so it runs unchanged in Node and
 * browsers.
 */

/** Thrown for input that is not valid in the requested encoding. */
export class EncodingError extends Error {
  override readonly name = 'EncodingError';
}

const utf8Encoder = new TextEncoder();

/** Encode a string as UTF-8 bytes. Lone surrogates become U+FFFD. */
export function utf8Encode(input: string): Uint8Array {
  return utf8Encoder.encode(input);
}

/**
 * Decode UTF-8 bytes. Invalid sequences become U+FFFD, or throw `EncodingError` when `fatal` is
 * true. A leading byte order mark is removed.
 */
export function utf8Decode(bytes: Uint8Array, options: { fatal?: boolean } = {}): string {
  try {
    return new TextDecoder('utf-8', { fatal: options.fatal ?? false }).decode(bytes);
  } catch (cause) {
    throw new EncodingError('Invalid UTF-8', { cause });
  }
}

function toBytes(input: string | Uint8Array): Uint8Array {
  return typeof input === 'string' ? utf8Encode(input) : input;
}

const CHUNK = 0x8000;

/** Standard base64 (RFC 4648 section 4) with padding. Strings are encoded as UTF-8 first. */
export function base64Encode(input: string | Uint8Array): string {
  const bytes = toBytes(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Decode standard base64 to bytes. Whitespace is ignored and padding is optional. Throws
 * `EncodingError` for any other character or an impossible length.
 */
export function base64DecodeBytes(input: string): Uint8Array {
  const text = input.replace(/[\t\n\f\r ]+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new EncodingError('Invalid base64');
  const unpadded = text.replace(/=+$/, '');
  if (unpadded.length % 4 === 1) throw new EncodingError('Invalid base64 length');
  if (text.includes('=') && text.length % 4 !== 0)
    throw new EncodingError('Invalid base64 padding');
  const padded = unpadded + '='.repeat((4 - (unpadded.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch (cause) {
    throw new EncodingError('Invalid base64', { cause });
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Decode standard base64 to a UTF-8 string. */
export function base64Decode(input: string): string {
  return utf8Decode(base64DecodeBytes(input));
}

/** URL- and filename-safe base64 (RFC 4648 section 5) without padding. */
export function base64UrlEncode(input: string | Uint8Array): string {
  return base64Encode(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode base64url (padding optional) to bytes. Rejects `+` and `/`. */
export function base64UrlDecodeBytes(input: string): Uint8Array {
  if (/[+/]/.test(input)) throw new EncodingError('Invalid base64url');
  return base64DecodeBytes(input.replace(/-/g, '+').replace(/_/g, '/'));
}

/** Decode base64url to a UTF-8 string. */
export function base64UrlDecode(input: string): string {
  return utf8Decode(base64UrlDecodeBytes(input));
}

/** Lowercase hex. Strings are encoded as UTF-8 first. */
export function hexEncode(input: string | Uint8Array): string {
  let out = '';
  for (const byte of toBytes(input)) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Decode hex (either case) to bytes. Throws `EncodingError` for odd lengths or non-hex characters. */
export function hexDecode(input: string): Uint8Array {
  if (input.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(input)) {
    throw new EncodingError('Invalid hex');
  }
  const bytes = new Uint8Array(input.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(input.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Concatenate byte arrays. */
export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Compare two byte arrays in time that depends only on their length, for comparing tokens.
 * Arrays of different length return false immediately.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/**
 * A reversible string transform used to put a target URL inside a proxy path. Codecs are
 * obfuscation, not encryption: anyone can decode them.
 */
export interface UrlCodec {
  readonly name: string;
  encode(input: string): string;
  decode(input: string): string;
}

function splitQuery(input: string): [string, string] {
  const q = input.indexOf('?');
  return q === -1 ? [input, ''] : [input.slice(0, q), input.slice(q)];
}

function xorChars(input: string, key: number): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    out += i % 2 === 1 ? String.fromCharCode(code ^ key) : input[i];
  }
  return out;
}

/**
 * XOR every second UTF-16 code unit with `key` (default 2), then percent-encode. With the default
 * key this is the "xor" codec common in web proxies. On decode, anything after the first `?` is
 * kept as is, so a proxy can append its own query string.
 */
export function xorEncode(input: string, key = 2): string {
  return encodeURIComponent(xorChars(input, key));
}

/** Reverse `xorEncode`. Throws `EncodingError` for malformed percent-encoding. */
export function xorDecode(input: string, key = 2): string {
  const [head, query] = splitQuery(input);
  let text: string;
  try {
    text = decodeURIComponent(head);
  } catch (cause) {
    throw new EncodingError('Invalid percent-encoding', { cause });
  }
  return xorChars(text, key) + query;
}

/** Codec that leaves strings unchanged. */
export const noneCodec: UrlCodec = {
  name: 'none',
  encode: (input) => input,
  decode: (input) => input,
};

/** Codec that percent-encodes with `encodeURIComponent`. */
export const plainCodec: UrlCodec = {
  name: 'plain',
  encode: (input) => encodeURIComponent(input),
  decode: (input) => {
    const [head, query] = splitQuery(input);
    try {
      return decodeURIComponent(head) + query;
    } catch (cause) {
      throw new EncodingError('Invalid percent-encoding', { cause });
    }
  },
};

/** Codec using `xorEncode` / `xorDecode` with key 2. */
export const xorCodec: UrlCodec = {
  name: 'xor',
  encode: (input) => xorEncode(input),
  decode: (input) => xorDecode(input),
};

/** Codec using base64url of the UTF-8 bytes, so the result needs no percent-encoding. */
export const base64Codec: UrlCodec = {
  name: 'base64',
  encode: (input) => base64UrlEncode(input),
  decode: (input) => {
    const [head, query] = splitQuery(input);
    return base64UrlDecode(head) + query;
  },
};

/** The built-in codecs by name. */
export const URL_CODECS: Readonly<Record<'none' | 'plain' | 'xor' | 'base64', UrlCodec>> = {
  none: noneCodec,
  plain: plainCodec,
  xor: xorCodec,
  base64: base64Codec,
};

/** Look up a built-in codec by name. Throws `EncodingError` for an unknown name. */
export function getUrlCodec(name: string): UrlCodec {
  if (!Object.hasOwn(URL_CODECS, name)) throw new EncodingError(`Unknown URL codec: ${name}`);
  return URL_CODECS[name as keyof typeof URL_CODECS];
}
