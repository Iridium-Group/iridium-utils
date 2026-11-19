/**
 * Clean up an upstream response's headers the way a rewriting proxy would. No network access.
 *
 *   node examples/proxy-headers.ts
 */
import {
  addCspSource,
  getCharset,
  omitHeaders,
  removeCspDirectives,
  stripHopByHopHeaders,
  toHeaderMultiMap,
} from '../src/index.ts';

const upstream = new Headers({
  Connection: 'keep-alive, X-Upstream-Hop',
  'Keep-Alive': 'timeout=5',
  'X-Upstream-Hop': '1',
  'Content-Type': 'text/html; charset="UTF-8"',
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
});
upstream.append('Set-Cookie', 'session=abc; Path=/; HttpOnly');
upstream.append('Set-Cookie', 'theme=dark; Path=/');

const forwarded = omitHeaders(stripHopByHopHeaders(upstream), ['x-frame-options']);
const result = toHeaderMultiMap(forwarded);
const csp = result['content-security-policy']?.[0];
if (csp) {
  const relaxed = removeCspDirectives(csp, ['frame-ancestors']);
  result['content-security-policy'] = [addCspSource(relaxed, 'connect-src', 'wss://proxy.test')];
}

console.log('charset:', getCharset(result['content-type']?.[0] ?? ''));
console.log(result);
