# API reference

All exports come from `@iridium-group/utils`. Each module is also available on its own subpath:
`@iridium-group/utils/address`, `/url`, `/encoding`, `/json`, `/headers` and `/timing`. No module
imports a `node:` builtin, so every entry point can be bundled for browsers.

## address

| Function                  | Returns                | Notes                                                                |
| ------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `parseIPv4(input)`        | `[n, n, n, n] \| null` | Strict dotted quad: no leading zeros, hex, octal or shortened forms. |
| `parseIPv6(input)`        | `number[] \| null`     | Eight 16-bit groups. Accepts brackets, zone ids and an IPv4 tail.    |
| `ipVersion(input)`        | `0 \| 4 \| 6`          |                                                                      |
| `isIPv4(input)`           | `boolean`              |                                                                      |
| `isIPv6(input)`           | `boolean`              |                                                                      |
| `formatIPv6(groups)`      | `string`               | RFC 5952 canonical form. Throws `RangeError` for invalid groups.     |
| `normalizeAddress(input)` | `string \| null`       | Canonical text for either family, without brackets or zone id.       |
| `isLoopbackAddress(ip)`   | `boolean`              | 127.0.0.0/8, `::1`, and IPv4-mapped loopback.                        |
| `parseCidr(input)`        | `Cidr \| null`         | `{ version, bytes, prefix }`. No prefix means /32 or /128.           |
| `isInCidr(ip, cidr)`      | `boolean`              | `cidr` is a string or a `Cidr`. Never matches across families.       |
| `isPrivateIPv4(ip)`       | `boolean`              | False for non-IPv4 input.                                            |
| `isPrivateIPv6(ip)`       | `boolean`              | False for non-IPv6 input.                                            |
| `isPrivateAddress(ip)`    | `boolean`              | Either family. True for invalid input (fails closed).                |

### Ranges treated as private

IPv4: 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12,
192.0.0.0/24, 192.0.2.0/24, 192.88.99.0/24, 192.168.0.0/16, 198.18.0.0/15, 198.51.100.0/24,
203.0.113.0/24, 224.0.0.0/4, 240.0.0.0/4.

IPv6: ::/96 (unspecified, loopback, IPv4-compatible), ::ffff:0:0/96 (IPv4-mapped, always),
::ffff:0:0:0/96 (IPv4-translated), 64:ff9b::/96 when the embedded IPv4 address is private,
64:ff9b:1::/48, 100::/64, 2001::/32 (Teredo), 2001:db8::/32, 2002::/16 when the embedded IPv4
address is private, 3fff::/20, fc00::/7, fe80::/10, fec0::/10, ff00::/8.

These are the same ranges `@iridium-group/transport` uses.

## url

| Function                        | Returns               | Notes                                                            |
| ------------------------------- | --------------------- | ---------------------------------------------------------------- |
| `parseUrl(input, base?)`        | `URL \| null`         | Never throws.                                                    |
| `isHttpUrl(input)`              | `boolean`             | Absolute `http:` or `https:`.                                    |
| `isWebSocketUrl(input)`         | `boolean`             | Absolute `ws:` or `wss:`.                                        |
| `getDefaultPort(protocol)`      | `number \| undefined` | `http`, `https`, `ws`, `wss`, `ftp`; with or without the colon.  |
| `getEffectivePort(url)`         | `number \| undefined` | Explicit port, else the scheme default.                          |
| `normalizeUrl(input, options?)` | `string \| null`      | See below.                                                       |
| `redactUrlCredentials(input)`   | `string`              | Removes `user:password@`; returns non-URLs unchanged.            |
| `isSameOrigin(a, b)`            | `boolean`             | False when either is invalid or has an opaque origin.            |
| `withQuery(input, params)`      | `string \| null`      | `null`/`undefined` removes, arrays repeat, other values are set. |
| `splitHostPort(input)`          | `HostPort \| null`    | `{ host, port }`; handles `[v6]:port` and bare IPv6.             |
| `formatHostPort(host, port?)`   | `string`              | Brackets and canonicalizes IPv6 literals.                        |
| `parsePort(input)`              | `number \| null`      | Decimal 1 to 65535 only.                                         |

`NormalizeUrlOptions`: `stripHash` (default true), `stripCredentials` (default true), `sortQuery`
(default false), `stripTrailingDot` (default true). The `URL` parser already lowercases scheme and
host, removes default ports and resolves dot segments.

## encoding

| Function                                         | Returns      | Notes                                                   |
| ------------------------------------------------ | ------------ | ------------------------------------------------------- |
| `utf8Encode(text)`                               | `Uint8Array` |                                                         |
| `utf8Decode(bytes, { fatal? })`                  | `string`     | U+FFFD for bad input, or `EncodingError` when `fatal`.  |
| `base64Encode(input)`                            | `string`     | Strings are UTF-8 encoded first. Padded.                |
| `base64DecodeBytes(text)` / `base64Decode`       | bytes / text | Whitespace ignored, padding optional, strict otherwise. |
| `base64UrlEncode(input)`                         | `string`     | `-` and `_`, no padding.                                |
| `base64UrlDecodeBytes(text)` / `base64UrlDecode` | bytes / text | Rejects `+` and `/`.                                    |
| `hexEncode(input)`                               | `string`     | Lowercase.                                              |
| `hexDecode(text)`                                | `Uint8Array` | Either case. Throws for odd length or non-hex.          |
| `concatBytes(...parts)`                          | `Uint8Array` |                                                         |
| `timingSafeEqual(a, b)`                          | `boolean`    | Time depends only on length.                            |
| `xorEncode(text, key = 2)`                       | `string`     | XOR every second code unit, then `encodeURIComponent`.  |
| `xorDecode(text, key = 2)`                       | `string`     | Keeps anything after the first `?` unchanged.           |
| `getUrlCodec(name)`                              | `UrlCodec`   | Throws `EncodingError` for unknown names.               |

`UrlCodec` is `{ name, encode(text), decode(text) }`. Built-ins, also in `URL_CODECS`:
`noneCodec`, `plainCodec` (`encodeURIComponent`), `xorCodec`, `base64Codec` (base64url of UTF-8).
Every codec's `decode` except `none` keeps a trailing `?query` as is.

`class EncodingError extends Error` (`name` is `'EncodingError'`) is thrown for invalid input.

## json

| Function                                    | Returns             | Notes                                                  |
| ------------------------------------------- | ------------------- | ------------------------------------------------------ |
| `parseJson<T>(text, options?)`              | `T`                 | Throws `JsonError`.                                    |
| `safeJsonParse<T>(text, options?)`          | `SafeJsonResult<T>` | `{ ok: true, value }` or `{ ok: false, error }`.       |
| `tryParseJson<T>(text, fallback, options?)` | `T`                 | `fallback` on any failure.                             |
| `jsonDepth(text)`                           | `number`            | Deepest nesting, ignoring brackets in strings.         |
| `safeJsonStringify(value, options?)`        | `string`            | Cycles become `'[Circular]'`, BigInt becomes a string. |
| `isPlainObject(value)`                      | `boolean`           | Prototype is `Object.prototype` or null.               |

`ParseJsonOptions`: `maxLength` (default 1 MiB, `DEFAULT_JSON_MAX_LENGTH`), `maxDepth` (default
64, `DEFAULT_JSON_MAX_DEPTH`), `unsafeKeys`: `'drop'` (default), `'throw'` or `'keep'`. The unsafe
keys are listed in `UNSAFE_JSON_KEYS`: `__proto__`, `constructor`, `prototype`.

`SafeJsonStringifyOptions`: `space`, `circular` (replacement text).

`class JsonError extends Error` has a `code`:

| Code         | When                                                |
| ------------ | --------------------------------------------------- |
| `TOO_LARGE`  | Input longer than `maxLength`.                      |
| `TOO_DEEP`   | Nesting deeper than `maxDepth`.                     |
| `INVALID`    | Not valid JSON (the `SyntaxError` is the `cause`).  |
| `UNSAFE_KEY` | An unsafe key was found with `unsafeKeys: 'throw'`. |

## headers

`HeaderInput` is a `Headers` object, an iterable of `[name, value]` pairs, or a record whose
values are strings, numbers, string arrays or `undefined`. `HeaderEntry` is
`[lowercaseName, value]`.

| Function                                 | Returns                    | Notes                                                        |
| ---------------------------------------- | -------------------------- | ------------------------------------------------------------ |
| `isValidHeaderName(name)`                | `boolean`                  | RFC 9110 token.                                              |
| `isValidHeaderValue(value)`              | `boolean`                  | No CR, LF or NUL.                                            |
| `normalizeHeaderName(name)`              | `string`                   | Trimmed, lowercase. Throws `TypeError` if invalid.           |
| `headerEntries(input)`                   | `HeaderEntry[]`            | Arrays expand; each `set-cookie` stays separate.             |
| `toHeaderMultiMap(input)`                | `Record<string, string[]>` | Null-prototype object.                                       |
| `toHeaderRecord(input)`                  | `Record<string, string>`   | Repeats joined with `', '`. Null-prototype object.           |
| `toHeaders(input)`                       | `Headers`                  |                                                              |
| `omitHeaders(input, names)`              | `HeaderEntry[]`            | Case-insensitive.                                            |
| `stripHopByHopHeaders(input)`            | `HeaderEntry[]`            | `HOP_BY_HOP_HEADERS` plus names listed in `Connection`.      |
| `parseCsp(value)`                        | `CspPolicy`                | `Map<directive, sources[]>`; first duplicate wins.           |
| `parseCspList(value)`                    | `CspPolicy[]`              | Comma-separated policies.                                    |
| `serializeCsp(policy)`                   | `string`                   |                                                              |
| `removeCspDirectives(value, directives)` | `string`                   | Applied to every policy in the value.                        |
| `addCspSource(value, directive, source)` | `string`                   | Creates the directive from `default-src`; replaces `'none'`. |
| `parseContentType(value)`                | `ContentType \| null`      | `{ mimeType, type, subtype, params }`; quoted values.        |
| `getCharset(contentType)`                | `string \| undefined`      | Lowercase.                                                   |

Constants: `HOP_BY_HOP_HEADERS` (`connection`, `keep-alive`, `proxy-authenticate`,
`proxy-authorization`, `proxy-connection`, `te`, `trailer`, `transfer-encoding`, `upgrade`) and
`SECURITY_POLICY_HEADERS` (`content-security-policy`, `content-security-policy-report-only`,
`x-frame-options`, `cross-origin-embedder-policy`, `cross-origin-opener-policy`,
`cross-origin-resource-policy`, `strict-transport-security`).

## timing

| Function                          | Returns          | Notes                                                                   |
| --------------------------------- | ---------------- | ----------------------------------------------------------------------- |
| `sleep(ms, { signal? })`          | `Promise<void>`  | Rejects with the signal's reason on abort. `RangeError` for bad delays. |
| `timeout(ms, { signal? })`        | `Promise<never>` | Rejects with `TimeoutError` after `ms`.                                 |
| `withTimeout(work, ms, options?)` | `Promise<T>`     | `work` is a promise or `(signal) => Promise<T>`; see below.             |
| `debounce(fn, ms, options?)`      | `Debounced`      | `cancel()`, `flush()`, `pending()`. Options `leading`, `trailing`.      |
| `backoffDelay(attempt, options?)` | `number`         | Exponential, capped, with `'full'`, `'equal'` or `'none'` jitter.       |
| `retry(fn, options?)`             | `Promise<T>`     | `fn(attempt, signal)`; waits `backoffDelay` between failures.           |

`withTimeout` options: `signal` and `message`. When `work` is a function it receives a signal
that aborts on timeout or when the outer signal aborts. The timer is always cleared.

`BackoffOptions`: `initialMs` (100), `maxMs` (30 000), `factor` (2), `jitter` (`'full'`),
`random` (`Math.random`). `RetryOptions` adds `retries` (3), `signal` and
`shouldRetry(error, attempt)`.

`class TimeoutError extends Error` has `name` `'TimeoutError'` and `timeoutMs`.
