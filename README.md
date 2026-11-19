<p align="center"><img src="./.github/assets/iridium-mark.svg" width="96" alt="Iridium Group"></p>

<h1 align="center">iridium-utils</h1>

<p align="center">
  <a href="https://github.com/Iridium-Group/iridium-utils/actions/workflows/ci.yml"><img src="https://github.com/Iridium-Group/iridium-utils/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
</p>

Pure helpers for Node and browsers: URL parsing, encodings, safe JSON, header handling, timing,
and private-address checks. Small, dependency-free functions that the other Iridium packages and
browser-based proxy applications keep needing.

Part of [Iridium Group](https://github.com/Iridium-Group): open web infrastructure for
browser-based networking and proxy applications.

**Status: Experimental.** Version 0.1.0. The API may change before 1.0. Not yet published to npm.

## Contents

- [Features](#features)
- [Install](#install)
- [Usage](#usage)
- [Examples](#examples)
- [Security notes](#security-notes)
- [Limitations](#limitations)
- [Development](#development)
- [Documentation](#documentation)
- [Dependencies and licenses](#dependencies-and-licenses)
- [License](#license)

## Features

- **`url`**: `parseUrl` that returns null instead of throwing, `normalizeUrl`, `isSameOrigin`,
  `withQuery`, `splitHostPort` / `formatHostPort` with IPv6 brackets, strict `parsePort`, and
  `redactUrlCredentials` for logs.
- **`encoding`**: UTF-8, base64, base64url and hex for strings and bytes, `concatBytes`,
  `timingSafeEqual`, and the URL codecs used by web proxies (`none`, `plain`, `xor`, `base64`).
- **`json`**: `parseJson` with a size limit, a depth limit checked before parsing, and
  prototype-pollution guards (`__proto__`, `constructor` and `prototype` keys are dropped by
  default). `safeJsonParse` returns a result instead of throwing; `safeJsonStringify` survives
  cycles and BigInt.
- **`headers`**: header name and value validation, flattening of `Headers`, records and entry
  lists (keeping each `set-cookie` separate), hop-by-hop stripping including headers named in
  `Connection`, Content-Security-Policy parsing and editing, and Content-Type parsing.
- **`timing`**: `sleep`, `timeout` and `withTimeout` with `AbortSignal` support, `debounce` with
  `cancel` / `flush`, `backoffDelay` with jitter, and `retry`.
- **`address`**: strict IPv4 and IPv6 parsing, RFC 5952 formatting, CIDR matching, and
  `isPrivateIPv4` / `isPrivateIPv6` / `isPrivateAddress`: the address policy shared with
  [`@iridium-group/transport`](https://github.com/Iridium-Group/iridium-transport).
- Every module is browser-safe: nothing imports a `node:` module or uses `Buffer` or `process`.
- Zero runtime dependencies. ESM only. TypeScript types included.

## Install

The package is not on npm yet. Install it from GitHub; the `prepare` script builds `dist/`:

```sh
npm install github:Iridium-Group/iridium-utils
```

Requires Node.js 22.18 or newer, or any current browser through a bundler.

## Usage

### Private-address checks

```ts
import { isPrivateAddress, normalizeAddress, splitHostPort } from '@iridium-group/utils';

const target = splitHostPort('[::ffff:169.254.169.254]:80'); // { host: '::ffff:169.254.169.254', port: 80 }
isPrivateAddress(target!.host); // true: IPv4-mapped cloud metadata address
isPrivateAddress('example.com'); // true: not an IP literal, so it fails closed
normalizeAddress('[2001:0DB8::0001]'); // '2001:db8::1'
```

Resolve hostnames yourself and check every answer; `isPrivateAddress` only reads IP literals.

### Safe JSON

```ts
import { parseJson, safeJsonParse } from '@iridium-group/utils/json';

const config = parseJson('{"__proto__":{"admin":true},"port":8080}', { maxDepth: 16 });
// { port: 8080 }

const result = safeJsonParse(untrustedText, { maxLength: 64 * 1024 });
if (!result.ok) console.error(result.error.code); // 'TOO_LARGE' | 'TOO_DEEP' | 'INVALID' | 'UNSAFE_KEY'
```

### Forwarding headers

```ts
import { omitHeaders, stripHopByHopHeaders, toHeaders } from '@iridium-group/utils/headers';

const forwarded = toHeaders(
  omitHeaders(stripHopByHopHeaders(upstream.headers), ['x-frame-options']),
);
```

### URL codecs

```ts
import { getUrlCodec } from '@iridium-group/utils/encoding';

const xor = getUrlCodec('xor');
xor.encode('https://example.com/'); // 'hvtrs8%2F-ezaopne%2Ccmm-'
xor.decode('hvtrs8%2F-ezaopne%2Ccmm-'); // 'https://example.com/'
```

### Timeouts and retries

```ts
import { retry, withTimeout } from '@iridium-group/utils/timing';

const response = await retry(
  () => withTimeout((signal) => fetch('https://example.com/', { signal }), 5000),
  { retries: 3, initialMs: 200 },
);
```

### Subpath imports

Each module has its own entry point: `@iridium-group/utils/url`, `/encoding`, `/json`,
`/headers`, `/timing` and `/address`. The root entry re-exports all of them. The package sets
`"sideEffects": false`, so bundlers drop what you do not use.

## Examples

Run from a clone of this repository after `npm ci`:

```sh
node examples/address-check.ts   # classify proxy targets as allowed or blocked
node examples/proxy-headers.ts   # clean up upstream response headers
node examples/url-codecs.ts      # encode a URL with each codec, safe JSON, withTimeout
```

None of them use the network.

## Security notes

- `isPrivateAddress` fails closed: anything that is not a valid IP literal returns true. IPv4
  parsing is strict (no octal, hex, or shortened forms such as `127.1`), so alternative spellings
  of loopback are rejected rather than misread. IPv4-mapped IPv6 addresses are always private.
- `parseJson` checks length and nesting before calling `JSON.parse`, so oversized or deeply nested
  input is rejected without allocating the result.
- Dropping `__proto__`, `constructor` and `prototype` keys protects code that later merges parsed
  objects. It does not make the parsed data trustworthy; validate its shape separately.
- URL codecs are obfuscation, not encryption.
- `timingSafeEqual` is constant-time in JavaScript terms only; it is suitable for comparing tokens,
  not a substitute for a platform crypto API where one is available.

To report a vulnerability, use GitHub private vulnerability reporting ("Report a vulnerability" on
this repository's Security tab). There is no security email address yet.

## Limitations

- `isPrivateAddress` checks IP literals only. It does not resolve DNS; callers must resolve and
  check every answer (as `AddressPolicy` in `@iridium-group/transport` does).
- `isInCidr` does not unwrap IPv4-mapped IPv6 addresses; match those with `isPrivateIPv6` or
  normalize first.
- The `base64` URL codec encodes UTF-8 bytes as base64url. It is not byte-compatible with codecs
  that call `btoa` on the raw string for non-ASCII input.
- `toHeaderRecord` joins repeated headers with `', '`, which is wrong for `set-cookie`; use
  `toHeaderMultiMap` or `headerEntries` when cookies matter.
- `@iridium-group/transport` currently keeps its own copy of the address checks. It will import
  them from this package once it is installable from npm.

## Development

```sh
npm ci
npm run format:check
npm run typecheck
npm test
npm run build
```

Tests use the built-in `node --test` runner and run the TypeScript sources directly. A test also
checks that no file in `src/` imports a `node:` module.

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Documentation

- [docs/API.md](./docs/API.md): every exported function, class and type.
- [CHANGELOG.md](./CHANGELOG.md)

## Dependencies and licenses

Runtime dependencies: none.

Development dependencies:

| Package       | License    | Used for                 |
| ------------- | ---------- | ------------------------ |
| `typescript`  | Apache-2.0 | Type checking and build  |
| `@types/node` | MIT        | Node.js type definitions |
| `prettier`    | MIT        | Formatting               |

## License

[MIT](./LICENSE) © 2026 Iridium Group contributors
