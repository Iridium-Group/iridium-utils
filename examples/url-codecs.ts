/**
 * Encode a target URL into a proxy path with each built-in codec, then decode it back.
 *
 *   node examples/url-codecs.ts
 */
import {
  URL_CODECS,
  normalizeUrl,
  parseJson,
  safeJsonStringify,
  withTimeout,
  sleep,
} from '../src/index.ts';

const target = normalizeUrl('HTTPS://Example.com:443/search?q=iridium#results') ?? '';

for (const codec of Object.values(URL_CODECS)) {
  const path = `/service/${codec.encode(target)}`;
  const decoded = codec.decode(path.slice('/service/'.length));
  console.log(`${codec.name.padEnd(7)} ${path}  ->  ${decoded === target ? 'ok' : 'MISMATCH'}`);
}

const config = parseJson<{ codec: string }>('{"codec":"xor","__proto__":{"admin":true}}');
console.log('parsed config:', safeJsonStringify(config));

const slow = await withTimeout(
  sleep(50).then(() => 'done'),
  1000,
);
console.log('withTimeout:', slow);
