/**
 * IPv4 and IPv6 parsing, formatting, CIDR matching, and private / special-purpose address checks.
 *
 * `isPrivateIPv4`, `isPrivateIPv6` and `isPrivateAddress` define the address policy shared by the
 * Iridium packages: @iridium-group/transport mirrors these functions with the same signatures and
 * the same ranges. Change them together.
 *
 * Everything here is pure string parsing and works in Node and browsers.
 */

/** Parse a strict dotted-quad IPv4 address into four octets, or return null. */
export function parseIPv4(input: string): [number, number, number, number] | null {
  const parts = input.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith('0')) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets as [number, number, number, number];
}

/** Parse an IPv6 address (optionally bracketed, with a zone id, or an IPv4 tail) into eight 16-bit groups. */
export function parseIPv6(input: string): number[] | null {
  let text = input.trim();
  if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  if (text.length === 0 || !text.includes(':')) return null;

  let tail: number[] = [];
  const lastColon = text.lastIndexOf(':');
  const maybeV4 = text.slice(lastColon + 1);
  if (maybeV4.includes('.')) {
    const v4 = parseIPv4(maybeV4);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    text = text.slice(0, lastColon + 1);
    if (!text.endsWith('::')) text = text.slice(0, -1);
  }
  const expected = 8 - tail.length;

  const doubleColon = text.split('::');
  if (doubleColon.length > 2) return null;
  const parseGroups = (segment: string): number[] | null => {
    if (segment === '') return [];
    const groups: number[] = [];
    for (const group of segment.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      groups.push(parseInt(group, 16));
    }
    return groups;
  };

  const head = parseGroups(doubleColon[0] ?? '');
  if (!head) return null;
  let groups: number[];
  if (doubleColon.length === 2) {
    const rest = parseGroups(doubleColon[1] ?? '');
    if (!rest) return null;
    const missing = expected - head.length - rest.length;
    if (missing < 1) return null;
    groups = [...head, ...new Array<number>(missing).fill(0), ...rest];
  } else {
    groups = head;
  }
  groups = [...groups, ...tail];
  return groups.length === 8 ? groups : null;
}

type V4Range = readonly [number, number, number, number, number];

// [a, b, c, d, prefixLength]
const PRIVATE_V4_RANGES: readonly V4Range[] = [
  [0, 0, 0, 0, 8], // "this" network
  [10, 0, 0, 0, 8], // RFC 1918
  [100, 64, 0, 0, 10], // carrier-grade NAT (RFC 6598)
  [127, 0, 0, 0, 8], // loopback
  [169, 254, 0, 0, 16], // link-local, includes cloud metadata 169.254.169.254
  [172, 16, 0, 0, 12], // RFC 1918
  [192, 0, 0, 0, 24], // IETF protocol assignments
  [192, 0, 2, 0, 24], // TEST-NET-1
  [192, 88, 99, 0, 24], // deprecated 6to4 relay anycast
  [192, 168, 0, 0, 16], // RFC 1918
  [198, 18, 0, 0, 15], // benchmarking
  [198, 51, 100, 0, 24], // TEST-NET-2
  [203, 0, 113, 0, 24], // TEST-NET-3
  [224, 0, 0, 0, 4], // multicast
  [240, 0, 0, 0, 4], // reserved, includes broadcast 255.255.255.255
];

function v4ToInt(o: readonly number[]): number {
  return (((o[0] ?? 0) << 24) | ((o[1] ?? 0) << 16) | ((o[2] ?? 0) << 8) | (o[3] ?? 0)) >>> 0;
}

function v4InRange(value: number, range: V4Range): boolean {
  const prefix = range[4];
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) >>> 0 === (v4ToInt(range) & mask) >>> 0;
}

function isPrivateV4Octets(octets: readonly number[]): boolean {
  const value = v4ToInt(octets);
  return PRIVATE_V4_RANGES.some((range) => v4InRange(value, range));
}

/**
 * True when `ip` is an IPv4 address that should not be reachable from a public proxy:
 * loopback, RFC 1918, carrier-grade NAT, link-local (including 169.254.169.254), documentation,
 * benchmarking, multicast, reserved, and 0.0.0.0/8. False for public addresses and for input
 * that is not an IPv4 address.
 */
export function isPrivateIPv4(ip: string): boolean {
  const octets = parseIPv4(ip);
  return octets !== null && isPrivateV4Octets(octets);
}

/**
 * True when `ip` is an IPv6 address that should not be reachable from a public proxy:
 * unspecified, loopback, IPv4-mapped and IPv4-compatible (always), unique local (fc00::/7,
 * which includes the fd00:ec2::254 metadata address), link-local, site-local, multicast,
 * documentation, discard, Teredo, local-use NAT64, and NAT64 (64:ff9b::/96) or 6to4
 * (2002::/16) addresses that embed a private IPv4 address. False for public addresses and for
 * input that is not an IPv6 address.
 */
export function isPrivateIPv6(ip: string): boolean {
  const g = parseIPv6(ip);
  if (!g) return false;
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  const embeddedV4 = [g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff];

  // ::/96 covers unspecified (::), loopback (::1) and IPv4-compatible addresses.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) return true;
  // ::ffff:0:0/96 IPv4-mapped. Blocked outright: a resolver has no reason to return one.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) return true;
  // ::ffff:0:0:0/96 IPv4-translated (RFC 2765).
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) return true;
  // 64:ff9b::/96 well-known NAT64 prefix: check the embedded IPv4 address.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return isPrivateV4Octets(embeddedV4);
  }
  // 64:ff9b:1::/48 local-use NAT64.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 1) return true;
  // 100::/64 discard-only.
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true;
  // 2001::/32 Teredo.
  if (g0 === 0x2001 && g1 === 0) return true;
  // 2001:db8::/32 documentation.
  if (g0 === 0x2001 && g1 === 0xdb8) return true;
  // 2002::/16 6to4: the IPv4 address sits in groups 1 and 2.
  if (g0 === 0x2002) return isPrivateV4Octets([g1 >> 8, g1 & 0xff, g2 >> 8, g2 & 0xff]);
  // 3fff::/20 documentation (RFC 9637).
  if ((g0 & 0xfff0) === 0x3ff0) return true;
  // fc00::/7 unique local.
  if ((g0 & 0xfe00) === 0xfc00) return true;
  // fe80::/10 link-local.
  if ((g0 & 0xffc0) === 0xfe80) return true;
  // fec0::/10 site-local (deprecated).
  if ((g0 & 0xffc0) === 0xfec0) return true;
  // ff00::/8 multicast.
  if ((g0 & 0xff00) === 0xff00) return true;
  return false;
}

/**
 * True when `ip` is a private or special-purpose IPv4 or IPv6 address.
 * Fails closed: input that is not a valid IP address also returns true.
 */
export function isPrivateAddress(ip: string): boolean {
  if (parseIPv4(ip)) return isPrivateIPv4(ip);
  if (parseIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

/** 4 for an IPv4 literal, 6 for an IPv6 literal, 0 otherwise. Brackets are accepted for IPv6. */
export function ipVersion(input: string): 0 | 4 | 6 {
  if (parseIPv4(input)) return 4;
  if (parseIPv6(input)) return 6;
  return 0;
}

/** True when `input` is a strict dotted-quad IPv4 address. */
export function isIPv4(input: string): boolean {
  return parseIPv4(input) !== null;
}

/** True when `input` is an IPv6 address. Brackets and zone ids are accepted. */
export function isIPv6(input: string): boolean {
  return parseIPv6(input) !== null;
}

/**
 * Format eight 16-bit groups as an IPv6 address in the RFC 5952 canonical form: lowercase hex,
 * no leading zeros, and the longest run of two or more zero groups compressed to `::`.
 */
export function formatIPv6(groups: readonly number[]): string {
  if (groups.length !== 8 || groups.some((g) => !Number.isInteger(g) || g < 0 || g > 0xffff)) {
    throw new RangeError('formatIPv6 expects eight integers between 0 and 0xffff');
  }
  let bestStart = -1;
  let bestLength = 0;
  for (let i = 0; i < 8;) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLength) {
      bestStart = i;
      bestLength = j - i;
    }
    i = j;
  }
  const hex = groups.map((g) => g.toString(16));
  if (bestLength < 2) return hex.join(':');
  const head = hex.slice(0, bestStart).join(':');
  const tail = hex.slice(bestStart + bestLength).join(':');
  return `${head}::${tail}`;
}

/**
 * Return the canonical text form of an IP address (dotted quad for IPv4, RFC 5952 for IPv6,
 * without brackets or zone id), or null when `input` is not an IP address.
 */
export function normalizeAddress(input: string): string | null {
  const v4 = parseIPv4(input.trim());
  if (v4) return v4.join('.');
  const v6 = parseIPv6(input);
  return v6 ? formatIPv6(v6) : null;
}

/** True for 127.0.0.0/8, ::1, and IPv4-mapped loopback (::ffff:127.0.0.0/104). */
export function isLoopbackAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return v4[0] === 127;
  const g = parseIPv6(ip);
  if (!g) return false;
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true;
  return g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff && (g[6] ?? 0) >> 8 === 127;
}

export interface Cidr {
  version: 4 | 6;
  /** The network address as 4 octets (IPv4) or 8 groups (IPv6). */
  bytes: number[];
  prefix: number;
}

/** Parse `a.b.c.d/n` or `x:y::z/n`. A missing prefix means a single address (/32 or /128). */
export function parseCidr(input: string): Cidr | null {
  const slash = input.indexOf('/');
  const addressPart = slash === -1 ? input : input.slice(0, slash);
  const prefixPart = slash === -1 ? undefined : input.slice(slash + 1);
  const v4 = parseIPv4(addressPart);
  const v6 = v4 ? null : parseIPv6(addressPart);
  if (!v4 && !v6) return null;
  const max = v4 ? 32 : 128;
  let prefix = max;
  if (prefixPart !== undefined) {
    if (!/^\d{1,3}$/.test(prefixPart)) return null;
    prefix = Number(prefixPart);
    if (prefix > max) return null;
  }
  return v4 ? { version: 4, bytes: v4, prefix } : { version: 6, bytes: v6 as number[], prefix };
}

function bitsMatch(a: readonly number[], b: readonly number[], width: number, prefix: number) {
  let remaining = prefix;
  for (let i = 0; i < a.length && remaining > 0; i++) {
    const take = Math.min(width, remaining);
    const mask = ((1 << take) - 1) << (width - take);
    if (((a[i] ?? 0) & mask) !== ((b[i] ?? 0) & mask)) return false;
    remaining -= take;
  }
  return true;
}

/**
 * True when `ip` falls inside `cidr` (a string or a parsed `Cidr`). Addresses of the other family
 * never match; IPv4-mapped IPv6 addresses are not unwrapped.
 */
export function isInCidr(ip: string, cidr: string | Cidr): boolean {
  const range = typeof cidr === 'string' ? parseCidr(cidr) : cidr;
  if (!range) return false;
  if (range.version === 4) {
    const v4 = parseIPv4(ip);
    return v4 !== null && bitsMatch(v4, range.bytes, 8, range.prefix);
  }
  const v6 = parseIPv6(ip);
  return v6 !== null && bitsMatch(v6, range.bytes, 16, range.prefix);
}
