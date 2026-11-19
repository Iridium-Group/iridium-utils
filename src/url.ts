/**
 * URL helpers built on the WHATWG `URL` class, which Node and every current browser provide.
 * Functions that take user input return null instead of throwing.
 */
import { formatIPv6, parseIPv6 } from './address.ts';

const DEFAULT_PORTS: Readonly<Record<string, number>> = {
  'http:': 80,
  'https:': 443,
  'ws:': 80,
  'wss:': 443,
  'ftp:': 21,
};

/** Parse `input` (optionally against `base`) into a `URL`, or return null when it is invalid. */
export function parseUrl(input: string | URL, base?: string | URL): URL | null {
  try {
    return new URL(input, base);
  } catch {
    return null;
  }
}

/** True when `input` parses as an absolute `http:` or `https:` URL. */
export function isHttpUrl(input: string | URL): boolean {
  const url = parseUrl(input);
  return url !== null && (url.protocol === 'http:' || url.protocol === 'https:');
}

/** True when `input` parses as an absolute `ws:` or `wss:` URL. */
export function isWebSocketUrl(input: string | URL): boolean {
  const url = parseUrl(input);
  return url !== null && (url.protocol === 'ws:' || url.protocol === 'wss:');
}

/** Default port for a scheme (`'https:'` or `'https'`), or undefined when there is none. */
export function getDefaultPort(protocol: string): number | undefined {
  const key = protocol.endsWith(':') ? protocol.toLowerCase() : `${protocol.toLowerCase()}:`;
  return DEFAULT_PORTS[key];
}

/** The port a URL connects to: its explicit port, or the scheme's default. */
export function getEffectivePort(url: URL): number | undefined {
  return url.port !== '' ? Number(url.port) : getDefaultPort(url.protocol);
}

export interface NormalizeUrlOptions {
  /** Remove the `#fragment`. Default true. */
  stripHash?: boolean;
  /** Remove `user:password@`. Default true. */
  stripCredentials?: boolean;
  /** Sort query parameters by name (stable for equal names). Default false. */
  sortQuery?: boolean;
  /** Remove a trailing dot from the hostname (`example.com.`). Default true. */
  stripTrailingDot?: boolean;
}

/**
 * Return a normalized string form of `input`, or null when it is not a valid absolute URL.
 * The `URL` parser already lowercases the scheme and host, drops default ports, resolves dot
 * segments and percent-encodes where needed; this adds the options above.
 */
export function normalizeUrl(
  input: string | URL,
  options: NormalizeUrlOptions = {},
): string | null {
  const url = parseUrl(input);
  if (!url) return null;
  if (options.stripHash ?? true) url.hash = '';
  if (options.stripCredentials ?? true) {
    url.username = '';
    url.password = '';
  }
  if ((options.stripTrailingDot ?? true) && url.hostname.endsWith('.')) {
    url.hostname = url.hostname.slice(0, -1);
  }
  if (options.sortQuery) url.searchParams.sort();
  return url.href;
}

/** Remove `user:password@` from a URL, for logging. Returns the input unchanged if it is not a URL. */
export function redactUrlCredentials(input: string): string {
  const url = parseUrl(input);
  if (!url || (url.username === '' && url.password === '')) return input;
  url.username = '';
  url.password = '';
  return url.href;
}

/** True when both inputs parse and have the same origin (scheme, host and effective port). */
export function isSameOrigin(a: string | URL, b: string | URL): boolean {
  const left = parseUrl(a);
  const right = parseUrl(b);
  if (!left || !right || left.origin === 'null' || right.origin === 'null') return false;
  return left.origin === right.origin;
}

/**
 * Return `input` with the given query parameters set. `undefined` and `null` values remove the
 * parameter; arrays set repeated parameters. Returns null when `input` is not a valid URL.
 */
export function withQuery(
  input: string | URL,
  params: Record<string, string | number | boolean | readonly string[] | null | undefined>,
): string | null {
  const url = parseUrl(input);
  if (!url) return null;
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.delete(name);
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value as readonly string[]) url.searchParams.append(name, item);
    } else {
      url.searchParams.set(name, String(value));
    }
  }
  return url.href;
}

export interface HostPort {
  /** Hostname or IP address, without brackets. */
  host: string;
  port: number | undefined;
}

/**
 * Split `host`, `host:port`, `[v6]` or `[v6]:port` into its parts. A bare IPv6 address without
 * brackets is accepted as a host with no port. Returns null for an empty host or an invalid port.
 */
export function splitHostPort(input: string): HostPort | null {
  const text = input.trim();
  if (text.startsWith('[')) {
    const end = text.indexOf(']');
    if (end === -1) return null;
    const host = text.slice(1, end);
    if (!parseIPv6(host)) return null;
    const rest = text.slice(end + 1);
    if (rest === '') return { host, port: undefined };
    if (!rest.startsWith(':')) return null;
    const port = parsePort(rest.slice(1));
    return port === null ? null : { host, port };
  }
  if (parseIPv6(text)) return { host: text, port: undefined };
  const colon = text.lastIndexOf(':');
  if (colon === -1) return text === '' ? null : { host: text, port: undefined };
  const host = text.slice(0, colon);
  const port = parsePort(text.slice(colon + 1));
  if (host === '' || host.includes(':') || port === null) return null;
  return { host, port };
}

/** Join a host and port, bracketing IPv6 literals: `formatHostPort('::1', 80)` is `[::1]:80`. */
export function formatHostPort(host: string, port?: number): string {
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  const groups = parseIPv6(bare);
  const shown = groups ? `[${formatIPv6(groups)}]` : bare;
  return port === undefined ? shown : `${shown}:${port}`;
}

/** Parse a decimal TCP/UDP port (1 to 65535), or return null. */
export function parsePort(input: string | number): number | null {
  const text = typeof input === 'number' ? String(input) : input.trim();
  if (!/^\d{1,5}$/.test(text)) return null;
  const port = Number(text);
  return port >= 1 && port <= 65535 ? port : null;
}
