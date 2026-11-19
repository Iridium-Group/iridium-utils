import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import * as utils from '../src/index.ts';

const srcDir = new URL('../src/', import.meta.url);

describe('package surface', () => {
  it('no source module imports node: builtins or Node-only globals', async () => {
    for (const file of await readdir(srcDir)) {
      const text = await readFile(new URL(file, srcDir), 'utf8');
      assert.doesNotMatch(text, /from ['"]node:/, file);
      assert.doesNotMatch(text, /\b(Buffer|process|require)\b[.(]/, file);
    }
  });
  it('re-exports every module from the root entry', () => {
    for (const name of [
      'isPrivateAddress',
      'parseUrl',
      'base64Encode',
      'parseJson',
      'stripHopByHopHeaders',
      'withTimeout',
    ]) {
      assert.equal(typeof (utils as Record<string, unknown>)[name], 'function', name);
    }
  });
});
