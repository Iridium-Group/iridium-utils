# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0 — 2026-11-19

### Added

- `address`: `parseIPv4`, `parseIPv6`, `ipVersion`, `isIPv4`, `isIPv6`, `formatIPv6` (RFC 5952), `normalizeAddress`, `isLoopbackAddress`, `parseCidr`, `isInCidr`, and the private and special-purpose checks `isPrivateIPv4`, `isPrivateIPv6` and `isPrivateAddress`, matching `@iridium-group/transport`.
- `url`: `parseUrl`, `isHttpUrl`, `isWebSocketUrl`, `getDefaultPort`, `getEffectivePort`, `normalizeUrl`, `redactUrlCredentials`, `isSameOrigin`, `withQuery`, `splitHostPort`, `formatHostPort` and `parsePort`.
- `encoding`: UTF-8, base64, base64url and hex codecs, `concatBytes`, `timingSafeEqual`, `EncodingError`, and the `none`, `plain`, `xor` and `base64` URL codecs with `getUrlCodec`.
- `json`: `parseJson`, `safeJsonParse` and `tryParseJson` with length and depth limits and prototype-pollution guards, `JsonError` with stable codes, `jsonDepth`, `safeJsonStringify` and `isPlainObject`.
- `headers`: name and value validation, `headerEntries`, `toHeaderRecord`, `toHeaderMultiMap`, `toHeaders`, `omitHeaders`, `stripHopByHopHeaders`, Content-Security-Policy parsing and editing, and `parseContentType` / `getCharset`.
- `timing`: `sleep`, `timeout`, `withTimeout`, `TimeoutError`, `debounce`, `backoffDelay` and `retry`, all `AbortSignal`-aware.
- Subpath entry points for every module, a test suite, runnable examples and API documentation.
