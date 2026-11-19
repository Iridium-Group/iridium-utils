/**
 * JSON parsing with size and depth limits and prototype-pollution guards, and a stringify that
 * survives cycles and BigInt values.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JsonErrorCode = 'TOO_LARGE' | 'TOO_DEEP' | 'INVALID' | 'UNSAFE_KEY';

/** Thrown by `parseJson`, and returned by `safeJsonParse`, with a stable `code`. */
export class JsonError extends Error {
  override readonly name = 'JsonError';
  readonly code: JsonErrorCode;

  constructor(code: JsonErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.code = code;
  }
}

/** Keys that can reach `Object.prototype` when parsed objects are later merged or assigned. */
export const UNSAFE_JSON_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

/** Default `maxLength`: 1 MiB of text. */
export const DEFAULT_JSON_MAX_LENGTH = 1024 * 1024;
/** Default `maxDepth`. */
export const DEFAULT_JSON_MAX_DEPTH = 64;

export interface ParseJsonOptions {
  /** Maximum input length in UTF-16 code units. Default 1 MiB. */
  maxLength?: number;
  /** Maximum nesting of objects and arrays. Default 64. */
  maxDepth?: number;
  /**
   * What to do with `__proto__`, `constructor` and `prototype` keys: `'drop'` removes them
   * (default), `'throw'` fails with `UNSAFE_KEY`, `'keep'` leaves them as own properties.
   */
  unsafeKeys?: 'drop' | 'throw' | 'keep';
}

/**
 * Deepest nesting of objects and arrays in `text`, ignoring brackets inside strings. Does not
 * validate the JSON. Runs in one pass without recursion, so it is safe on hostile input.
 */
export function jsonDepth(text: string): number {
  let depth = 0;
  let max = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (inString) {
      if (c === 0x5c) i++;
      else if (c === 0x22) inString = false;
    } else if (c === 0x22) {
      inString = true;
    } else if (c === 0x7b || c === 0x5b) {
      depth++;
      if (depth > max) max = depth;
    } else if (c === 0x7d || c === 0x5d) {
      depth--;
    }
  }
  return max;
}

/**
 * Parse JSON text or throw `JsonError`. Length and depth are checked before parsing, so oversized
 * or deeply nested input is rejected without building any objects.
 */
export function parseJson<T = JsonValue>(text: string, options: ParseJsonOptions = {}): T {
  const maxLength = options.maxLength ?? DEFAULT_JSON_MAX_LENGTH;
  const maxDepth = options.maxDepth ?? DEFAULT_JSON_MAX_DEPTH;
  const unsafeKeys = options.unsafeKeys ?? 'drop';
  if (typeof text !== 'string') throw new JsonError('INVALID', 'JSON input must be a string');
  if (text.length > maxLength) {
    throw new JsonError(
      'TOO_LARGE',
      `JSON input is ${text.length} long; the limit is ${maxLength}`,
    );
  }
  if (jsonDepth(text) > maxDepth) {
    throw new JsonError('TOO_DEEP', `JSON nesting exceeds the limit of ${maxDepth}`);
  }
  try {
    if (unsafeKeys === 'keep') return JSON.parse(text) as T;
    return JSON.parse(text, function (this: unknown, key: string, value: unknown) {
      if (UNSAFE_JSON_KEYS.includes(key) && !Array.isArray(this)) {
        if (unsafeKeys === 'throw') {
          throw new JsonError('UNSAFE_KEY', `JSON contains the unsafe key "${key}"`);
        }
        return undefined;
      }
      return value;
    }) as T;
  } catch (error) {
    if (error instanceof JsonError) throw error;
    throw new JsonError('INVALID', error instanceof Error ? error.message : 'Invalid JSON', {
      cause: error,
    });
  }
}

export type SafeJsonResult<T> = { ok: true; value: T } | { ok: false; error: JsonError };

/** Like `parseJson`, but returns `{ ok, value }` or `{ ok: false, error }` instead of throwing. */
export function safeJsonParse<T = JsonValue>(
  text: string,
  options: ParseJsonOptions = {},
): SafeJsonResult<T> {
  try {
    return { ok: true, value: parseJson<T>(text, options) };
  } catch (error) {
    return { ok: false, error: error as JsonError };
  }
}

/** Parse JSON with the default limits, returning `fallback` on any failure. */
export function tryParseJson<T>(text: string, fallback: T, options: ParseJsonOptions = {}): T {
  const result = safeJsonParse<T>(text, options);
  return result.ok ? result.value : fallback;
}

/** True for objects whose prototype is `Object.prototype` or null. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

export interface SafeJsonStringifyOptions {
  /** Passed to `JSON.stringify`. */
  space?: number | string;
  /** Text used in place of a repeated reference to an ancestor. Default `'[Circular]'`. */
  circular?: string;
}

/**
 * `JSON.stringify` that never throws on cycles or BigInt: a reference back to an ancestor becomes
 * `'[Circular]'` and a BigInt becomes its decimal string. Shared, non-circular references are
 * written out in full. Returns `'null'` when the top-level value is not serializable (undefined, a
 * function or a symbol).
 */
export function safeJsonStringify(value: unknown, options: SafeJsonStringifyOptions = {}): string {
  const marker = options.circular ?? '[Circular]';
  const ancestors: object[] = [];
  const out = JSON.stringify(
    value,
    function (this: unknown, _key: string, current: unknown) {
      if (typeof current === 'bigint') return current.toString();
      if (typeof current !== 'object' || current === null) return current;
      // `this` is the holder of `current`; drop ancestors that are no longer on the path.
      while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
      if (ancestors.includes(current)) return marker;
      ancestors.push(current);
      return current;
    },
    options.space,
  ) as string | undefined;
  return out ?? 'null';
}
