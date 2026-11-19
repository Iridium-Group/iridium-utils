/**
 * HTTP header helpers for proxies: normalization, hop-by-hop stripping, Content-Security-Policy
 * parsing and editing, and Content-Type parsing. Works with `Headers`, entry lists and plain
 * records, without touching the network.
 */

/** A header list in any of the shapes the helpers accept. Record values may be arrays. */
export type HeaderInput =
  | Headers
  | Iterable<readonly [string, string]>
  | Readonly<Record<string, string | readonly string[] | number | undefined>>;

/** A header as a lowercase name and its value. */
export type HeaderEntry = [name: string, value: string];

/** Hop-by-hop headers (RFC 9110 section 7.6.1, plus `keep-alive` and `proxy-connection`). */
export const HOP_BY_HOP_HEADERS: readonly string[] = [
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
];

/**
 * Response headers that restrict how a page may be framed, embedded or loaded. A rewriting proxy
 * usually removes or rewrites these, because the policies name the origin the proxy replaced.
 */
export const SECURITY_POLICY_HEADERS: readonly string[] = [
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'cross-origin-embedder-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'strict-transport-security',
];

const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** True when `name` is a valid header field name (an RFC 9110 token). */
export function isValidHeaderName(name: string): boolean {
  return TOKEN.test(name);
}

/** True when `value` contains no CR, LF or NUL, so it cannot split or truncate a header. */
export function isValidHeaderValue(value: string): boolean {
  return !/[\r\n\0]/.test(value);
}

/** Lowercase and trim a header name. Throws `TypeError` when the result is not a valid name. */
export function normalizeHeaderName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!isValidHeaderName(normalized)) throw new TypeError(`Invalid header name: ${name}`);
  return normalized;
}

function isHeaders(input: unknown): input is Headers {
  return typeof Headers !== 'undefined' && input instanceof Headers;
}

/**
 * Flatten any `HeaderInput` into `[lowercaseName, value]` entries in input order. Array values
 * become repeated entries, `undefined` values are skipped, and values are trimmed. For `Headers`,
 * each `set-cookie` is kept as its own entry.
 */
export function headerEntries(input: HeaderInput): HeaderEntry[] {
  const out: HeaderEntry[] = [];
  if (isHeaders(input)) {
    for (const [name, value] of input) {
      if (name === 'set-cookie') continue;
      out.push([name, value]);
    }
    for (const cookie of input.getSetCookie()) out.push(['set-cookie', cookie]);
    return out;
  }
  if (Symbol.iterator in Object(input)) {
    for (const [name, value] of input as Iterable<readonly [string, string]>) {
      out.push([normalizeHeaderName(name), String(value).trim()]);
    }
    return out;
  }
  for (const [name, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const key = normalizeHeaderName(name);
    const values = Array.isArray(value) ? (value as readonly string[]) : [String(value)];
    for (const item of values) out.push([key, item.trim()]);
  }
  return out;
}

/** Group headers by lowercase name: `{ 'set-cookie': ['a=1', 'b=2'] }`. */
export function toHeaderMultiMap(input: HeaderInput): Record<string, string[]> {
  const out: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const [name, value] of headerEntries(input)) (out[name] ??= []).push(value);
  return out;
}

/**
 * Combine headers into one string per lowercase name, joining repeats with `', '` as RFC 9110
 * allows. `set-cookie` cannot be combined that way; use `toHeaderMultiMap` when it matters.
 */
export function toHeaderRecord(input: HeaderInput): Record<string, string> {
  const out: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [name, values] of Object.entries(toHeaderMultiMap(input))) {
    out[name] = values.join(', ');
  }
  return out;
}

/** Build a `Headers` object from any `HeaderInput`. */
export function toHeaders(input: HeaderInput): Headers {
  const headers = new Headers();
  for (const [name, value] of headerEntries(input)) headers.append(name, value);
  return headers;
}

/** Return the entries whose names are not in `names` (case-insensitive). */
export function omitHeaders(input: HeaderInput, names: Iterable<string>): HeaderEntry[] {
  const drop = new Set<string>();
  for (const name of names) drop.add(name.trim().toLowerCase());
  return headerEntries(input).filter(([name]) => !drop.has(name));
}

/**
 * Remove hop-by-hop headers before forwarding a request or response: the fixed list in
 * `HOP_BY_HOP_HEADERS` plus every header named in a `Connection` header.
 */
export function stripHopByHopHeaders(input: HeaderInput): HeaderEntry[] {
  const entries = headerEntries(input);
  const drop = new Set(HOP_BY_HOP_HEADERS);
  for (const [name, value] of entries) {
    if (name !== 'connection') continue;
    for (const token of value.split(',')) {
      const listed = token.trim().toLowerCase();
      if (listed !== '') drop.add(listed);
    }
  }
  return entries.filter(([name]) => !drop.has(name));
}

/** A parsed Content-Security-Policy: directive name (lowercase) to its source list. */
export type CspPolicy = Map<string, string[]>;

/**
 * Parse one serialized policy, `"default-src 'self'; img-src *"`. Directive names are lowercased;
 * when a directive repeats, the first one wins, as browsers do.
 */
export function parseCsp(value: string): CspPolicy {
  const policy: CspPolicy = new Map();
  for (const part of value.split(';')) {
    const tokens = part
      .trim()
      .split(/[\t\n\f\r ]+/)
      .filter(Boolean);
    const name = tokens.shift()?.toLowerCase();
    if (!name || policy.has(name)) continue;
    policy.set(name, tokens);
  }
  return policy;
}

/**
 * Parse a Content-Security-Policy header value that may carry several policies separated by
 * commas (as happens when repeated headers are combined).
 */
export function parseCspList(value: string): CspPolicy[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map(parseCsp);
}

/** Serialize a policy back to header form: `"default-src 'self'; img-src *"`. */
export function serializeCsp(policy: CspPolicy): string {
  return [...policy]
    .map(([name, sources]) => (sources.length > 0 ? `${name} ${sources.join(' ')}` : name))
    .join('; ');
}

/** Return the header value with the named directives removed from every policy in it. */
export function removeCspDirectives(value: string, directives: Iterable<string>): string {
  const drop = [...directives].map((d) => d.toLowerCase());
  return parseCspList(value)
    .map((policy) => {
      for (const name of drop) policy.delete(name);
      return serializeCsp(policy);
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Return the header value with `source` added to `directive` in every policy. When the directive
 * is absent it is created from `default-src` (if present) plus `source`. `'none'` is replaced.
 */
export function addCspSource(value: string, directive: string, source: string): string {
  const name = directive.toLowerCase();
  return parseCspList(value)
    .map((policy) => {
      const current = policy.get(name) ?? (name.endsWith('-src') ? policy.get('default-src') : []);
      const sources = (current ?? []).filter((s) => s.toLowerCase() !== "'none'");
      if (!sources.includes(source)) sources.push(source);
      policy.set(name, sources);
      return serializeCsp(policy);
    })
    .join(', ');
}

export interface ContentType {
  /** `type/subtype`, lowercase. */
  mimeType: string;
  type: string;
  subtype: string;
  /** Parameter names lowercase; values unquoted. */
  params: Record<string, string>;
}

/** Parse a Content-Type value such as `text/html; charset="UTF-8"`, or return null. */
export function parseContentType(value: string): ContentType | null {
  const semi = value.indexOf(';');
  const essence = (semi === -1 ? value : value.slice(0, semi)).trim().toLowerCase();
  const slash = essence.indexOf('/');
  if (slash <= 0) return null;
  const type = essence.slice(0, slash);
  const subtype = essence.slice(slash + 1);
  if (!isValidHeaderName(type) || !isValidHeaderName(subtype)) return null;
  const params: Record<string, string> = Object.create(null) as Record<string, string>;
  const paramPattern = /;\s*([^=;\s]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g;
  const rest = semi === -1 ? '' : value.slice(semi);
  for (const match of rest.matchAll(paramPattern)) {
    const name = (match[1] ?? '').toLowerCase();
    let raw = (match[2] ?? '').trim();
    if (raw.startsWith('"')) raw = raw.slice(1, -1).replace(/\\(.)/g, '$1');
    if (!(name in params)) params[name] = raw;
  }
  return { mimeType: essence, type, subtype, params };
}

/** The `charset` parameter of a Content-Type value, lowercased, or undefined. */
export function getCharset(contentType: string): string | undefined {
  return parseContentType(contentType)?.params['charset']?.toLowerCase();
}
