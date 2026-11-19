import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  TimeoutError,
  backoffDelay,
  debounce,
  retry,
  sleep,
  timeout,
  withTimeout,
} from '../src/timing.ts';

describe('sleep and timeout', () => {
  it('sleeps for roughly the requested time', async () => {
    const start = performance.now();
    await sleep(20);
    assert.ok(performance.now() - start >= 15);
  });
  it('rejects with the abort reason, including when already aborted', async () => {
    const controller = new AbortController();
    const pending = sleep(10_000, { signal: controller.signal });
    controller.abort(new Error('stop'));
    await assert.rejects(pending, /stop/);
    await assert.rejects(sleep(10, { signal: AbortSignal.abort() }), { name: 'AbortError' });
  });
  it('rejects invalid delays', () => {
    assert.throws(() => sleep(-1), RangeError);
    assert.throws(() => sleep(Number.NaN), RangeError);
  });
  it('timeout() rejects with TimeoutError', async () => {
    await assert.rejects(
      timeout(5),
      (e: unknown) => e instanceof TimeoutError && e.timeoutMs === 5,
    );
  });
});

describe('withTimeout', () => {
  it('resolves when the work finishes in time', async () => {
    assert.equal(await withTimeout(Promise.resolve(42), 100), 42);
  });
  it('rejects with TimeoutError and aborts function-style work', async () => {
    let seen: AbortSignal | undefined;
    await assert.rejects(
      withTimeout(
        (signal) => {
          seen = signal;
          return sleep(10_000, { signal });
        },
        10,
        { message: 'too slow' },
      ),
      (e: unknown) => e instanceof TimeoutError && e.message === 'too slow',
    );
    assert.equal(seen?.aborted, true);
  });
  it('passes through rejections and synchronous throws', async () => {
    await assert.rejects(withTimeout(Promise.reject(new Error('boom')), 100), /boom/);
    await assert.rejects(
      withTimeout(() => {
        throw new Error('sync');
      }, 100),
      /sync/,
    );
  });
  it('follows an outer signal', async () => {
    const controller = new AbortController();
    const pending = withTimeout((signal) => sleep(10_000, { signal }), 10_000, {
      signal: controller.signal,
    });
    controller.abort(new Error('cancelled'));
    await assert.rejects(pending, /cancelled/);
  });
});

describe('debounce', () => {
  it('collapses a burst into one trailing call with the latest arguments', async () => {
    const calls: number[] = [];
    const fn = debounce((n: number) => calls.push(n), 20);
    fn(1);
    fn(2);
    fn(3);
    assert.equal(fn.pending(), true);
    await sleep(50);
    assert.deepEqual(calls, [3]);
    assert.equal(fn.pending(), false);
  });
  it('supports leading calls, cancel and flush', async () => {
    const calls: string[] = [];
    const lead = debounce((s: string) => calls.push(s), 20, { leading: true });
    lead('a');
    lead('b');
    await sleep(50);
    assert.deepEqual(calls, ['a', 'b']);

    const later = debounce((s: string) => calls.push(s), 20);
    later('cancelled');
    later.cancel();
    later('flushed');
    later.flush();
    await sleep(40);
    assert.deepEqual(calls, ['a', 'b', 'flushed']);
  });
});

describe('backoffDelay', () => {
  it('grows exponentially up to maxMs without jitter', () => {
    const opts = { initialMs: 100, factor: 2, maxMs: 1000, jitter: 'none' as const };
    assert.deepEqual(
      [0, 1, 2, 3, 4, 10].map((n) => backoffDelay(n, opts)),
      [100, 200, 400, 800, 1000, 1000],
    );
  });
  it('applies full and equal jitter from the random source', () => {
    assert.equal(backoffDelay(2, { random: () => 0.5 }), 200);
    assert.equal(backoffDelay(2, { jitter: 'equal', random: () => 0 }), 200);
    assert.equal(backoffDelay(2, { jitter: 'equal', random: () => 0.999999 }) < 400, true);
  });
});

describe('retry', () => {
  it('retries until success', async () => {
    let calls = 0;
    const value = await retry(
      async (attempt) => {
        calls++;
        if (attempt < 2) throw new Error('flaky');
        return 'ok';
      },
      { initialMs: 1, jitter: 'none' },
    );
    assert.equal(value, 'ok');
    assert.equal(calls, 3);
  });
  it('gives up after the retry budget or when shouldRetry says no', async () => {
    let calls = 0;
    await assert.rejects(
      retry(
        async () => {
          calls++;
          throw new Error(`fail ${calls}`);
        },
        { retries: 2, initialMs: 1 },
      ),
      /fail 3/,
    );
    let fatalCalls = 0;
    await assert.rejects(
      retry(
        async () => {
          fatalCalls++;
          throw new TypeError('fatal');
        },
        { shouldRetry: (e) => !(e instanceof TypeError) },
      ),
      TypeError,
    );
    assert.equal(fatalCalls, 1);
  });
  it('stops waiting when the signal aborts', async () => {
    const controller = new AbortController();
    const pending = retry(
      async () => {
        throw new Error('down');
      },
      { initialMs: 10_000, jitter: 'none', signal: controller.signal },
    );
    setTimeout(() => controller.abort(new Error('shutdown')), 10);
    await assert.rejects(pending, /shutdown/);
  });
});
