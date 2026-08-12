import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  moonlightBinariesPresent,
  moonlightUnavailablePayload,
  MOONLIGHT_UNAVAILABLE_BODY,
} from '../src/services/moonlightWeb.js';

describe('moonlightBinariesPresent', () => {
  it('is false when the directory is missing or empty', () => {
    assert.equal(moonlightBinariesPresent(undefined), false);
    assert.equal(moonlightBinariesPresent(null), false);
    assert.equal(moonlightBinariesPresent(''), false);

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatwy-mlw-'));
    try {
      assert.equal(moonlightBinariesPresent(dir), false);
      fs.writeFileSync(path.join(dir, 'web-server'), '');
      assert.equal(moonlightBinariesPresent(dir), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is true only when web-server and streamer both exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatwy-mlw-'));
    try {
      fs.writeFileSync(path.join(dir, 'web-server'), '');
      fs.writeFileSync(path.join(dir, 'streamer'), '');
      assert.equal(moonlightBinariesPresent(dir), true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('moonlightUnavailablePayload', () => {
  it('returns the available: false JSON when the runtime is missing', () => {
    assert.equal(moonlightUnavailablePayload(true), null);
    assert.deepEqual(moonlightUnavailablePayload(false), MOONLIGHT_UNAVAILABLE_BODY);
    assert.equal(MOONLIGHT_UNAVAILABLE_BODY.available, false);
    assert.match(MOONLIGHT_UNAVAILABLE_BODY.error, /not available/i);
  });

  it('treats missing binaries as unavailable (no live Sunshine host required)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gatwy-mlw-'));
    try {
      const available = moonlightBinariesPresent(dir);
      assert.equal(available, false);
      const body = moonlightUnavailablePayload(available);
      assert.deepEqual(body, {
        error: 'Moonlight runtime not available in this installation',
        available: false,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
