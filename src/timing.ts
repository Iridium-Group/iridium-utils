/**
 * Timers that cooperate with `AbortSignal`: sleep, timeouts, debounce, exponential backoff and
 * retry. Uses only `setTimeout`/`clearTimeout`, so it works in Node and browsers.
 */

type Timer = ReturnType<typeof setTimeout>;

/** Rejection reason for `timeout()` and `withTimeout()`. */
export class TimeoutError extends Error {
  override readonly name = 'TimeoutError';
  readonly timeoutMs: number;

  constructor(timeoutMs: number, message = `Timed out after ${timeoutMs} ms`) {
    super(message);
    this.timeoutMs = timeoutMs;
  }
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('This operation was aborted', 'AbortError');
}

function checkDelay(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`Invalid delay: ${String(ms)}`);
}

/** Resolve after `ms` milliseconds. Rejects with the signal's reason if it aborts first. */
export function sleep(ms: number, options: { signal?: AbortSignal } = {}): Promise<void> {
  checkDelay(ms);
  const { signal } = options;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal as AbortSignal));
    };
    const timer: Timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Reject with `TimeoutError` after `ms` milliseconds (or with the signal's reason on abort). */
export async function timeout(ms: number, options: { signal?: AbortSignal } = {}): Promise<never> {
  await sleep(ms, options);
  throw new TimeoutError(ms);
}

export interface WithTimeoutOptions {
  /** Aborts the wait (and the work, when `work` is a function). */
  signal?: AbortSignal;
  /** Message for the `TimeoutError`. */
  message?: string;
}

/**
 * Settle with `work`, or reject with `TimeoutError` after `ms`. When `work` is a function it
 * receives an `AbortSignal` that aborts on timeout or when `options.signal` aborts, so the work
 * can stop instead of running on in the background. The timer is always cleared.
 */
export function withTimeout<T>(
  work: Promise<T> | ((signal: AbortSignal) => Promise<T>),
  ms: number,
  options: WithTimeoutOptions = {},
): Promise<T> {
  checkDelay(ms);
  const controller = new AbortController();
  const outer = options.signal;
  return new Promise<T>((resolve, reject) => {
    if (outer?.aborted) {
      reject(abortReason(outer));
      return;
    }
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      outer?.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = () => {
      const reason = abortReason(outer as AbortSignal);
      controller.abort(reason);
      finish(() => reject(reason));
    };
    const timer: Timer = setTimeout(() => {
      const error = new TimeoutError(ms, options.message);
      controller.abort(error);
      finish(() => reject(error));
    }, ms);
    outer?.addEventListener('abort', onAbort, { once: true });

    let promise: Promise<T>;
    try {
      promise = typeof work === 'function' ? work(controller.signal) : work;
    } catch (error) {
      finish(() => reject(error));
      return;
    }
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /** Drop a pending call. */
  cancel(): void;
  /** Run a pending call now. */
  flush(): void;
  /** True while a call is waiting. */
  pending(): boolean;
}

export interface DebounceOptions {
  /** Call on the leading edge of a burst as well. Default false. */
  leading?: boolean;
  /** Call on the trailing edge of a burst. Default true. */
  trailing?: boolean;
}

/**
 * Delay calls to `fn` until `ms` milliseconds pass without another call. The trailing call gets
 * the most recent arguments.
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
  options: DebounceOptions = {},
): Debounced<A> {
  checkDelay(ms);
  const leading = options.leading ?? false;
  const trailing = options.trailing ?? true;
  let timer: Timer | undefined;
  let lastArgs: A | undefined;

  const run = () => {
    const args = lastArgs;
    lastArgs = undefined;
    if (args) fn(...args);
  };
  const debounced = ((...args: A) => {
    const idle = timer === undefined;
    if (timer !== undefined) clearTimeout(timer);
    if (idle && leading) fn(...args);
    else lastArgs = args;
    timer = setTimeout(() => {
      timer = undefined;
      if (trailing) run();
      lastArgs = undefined;
    }, ms);
  }) as Debounced<A>;
  debounced.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    lastArgs = undefined;
  };
  debounced.flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    run();
  };
  debounced.pending = () => timer !== undefined && lastArgs !== undefined;
  return debounced;
}

export interface BackoffOptions {
  /** Delay before the first retry. Default 100 ms. */
  initialMs?: number;
  /** Upper bound for any delay. Default 30 000 ms. */
  maxMs?: number;
  /** Growth per attempt. Default 2. */
  factor?: number;
  /**
   * `'full'` (default) picks uniformly in [0, delay]; `'equal'` in [delay/2, delay]; `'none'`
   * returns the delay itself.
   */
  jitter?: 'full' | 'equal' | 'none';
  /** Random source in [0, 1). Default `Math.random`. */
  random?: () => number;
}

/** Delay in ms before retry number `attempt` (0-based), with exponential growth and jitter. */
export function backoffDelay(attempt: number, options: BackoffOptions = {}): number {
  const initial = options.initialMs ?? 100;
  const max = options.maxMs ?? 30_000;
  const factor = options.factor ?? 2;
  const random = options.random ?? Math.random;
  const base = Math.min(max, initial * factor ** Math.max(0, attempt));
  switch (options.jitter ?? 'full') {
    case 'none':
      return base;
    case 'equal':
      return base / 2 + random() * (base / 2);
    default:
      return random() * base;
  }
}

export interface RetryOptions extends BackoffOptions {
  /** Retries after the first attempt. Default 3, so up to 4 calls. */
  retries?: number;
  /** Stops waiting and rejects with the signal's reason. */
  signal?: AbortSignal;
  /** Return false to fail immediately with this error. Default: retry every error. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Call `fn` until it resolves, waiting `backoffDelay(attempt)` between failures. Rejects with the
 * last error once `retries` are used up or `shouldRetry` returns false.
 */
export async function retry<T>(
  fn: (attempt: number, signal: AbortSignal | undefined) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const retries = options.retries ?? 3;
  for (let attempt = 0; ; attempt++) {
    if (options.signal?.aborted) throw abortReason(options.signal);
    try {
      return await fn(attempt, options.signal);
    } catch (error) {
      if (attempt >= retries || options.shouldRetry?.(error, attempt) === false) throw error;
      const delay = backoffDelay(attempt, options);
      await sleep(delay, options.signal ? { signal: options.signal } : {});
    }
  }
}
