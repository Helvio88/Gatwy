import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  moonlightUnavailablePayload,
  MOONLIGHT_UNAVAILABLE_BODY,
  MOONLIGHT_MISSING_HINT,
  filterListedConnections,
  isMoonlightWebAvailable,
  moonlightUpstream,
} from '../src/services/moonlightWeb.js';

describe('isMoonlightWebAvailable', () => {
  it('is true only for ENABLE_MOONLIGHT=1/true/yes', () => {
    const previous = process.env.ENABLE_MOONLIGHT;
    try {
      delete process.env.ENABLE_MOONLIGHT;
      assert.equal(isMoonlightWebAvailable(), false);

      process.env.ENABLE_MOONLIGHT = '0';
      assert.equal(isMoonlightWebAvailable(), false);

      process.env.ENABLE_MOONLIGHT = '1';
      assert.equal(isMoonlightWebAvailable(), true);

      process.env.ENABLE_MOONLIGHT = 'true';
      assert.equal(isMoonlightWebAvailable(), true);

      process.env.ENABLE_MOONLIGHT = 'YES';
      assert.equal(isMoonlightWebAvailable(), true);
    } finally {
      if (previous === undefined) delete process.env.ENABLE_MOONLIGHT;
      else process.env.ENABLE_MOONLIGHT = previous;
    }
  });
});

describe('moonlightUpstream', () => {
  it('points at the moonlight-web sidecar, not loopback', () => {
    const upstream = moonlightUpstream();
    assert.equal(upstream.host, 'moonlight-web');
    assert.equal(upstream.port, 19080);
    assert.notEqual(upstream.host, '127.0.0.1');
    assert.notEqual(upstream.host, 'localhost');
  });
});

describe('moonlightUnavailablePayload', () => {
  it('returns the available: false JSON when the runtime is missing', () => {
    assert.equal(moonlightUnavailablePayload(true), null);
    assert.deepEqual(moonlightUnavailablePayload(false), MOONLIGHT_UNAVAILABLE_BODY);
    assert.equal(MOONLIGHT_UNAVAILABLE_BODY.available, false);
    assert.match(MOONLIGHT_UNAVAILABLE_BODY.error, /not available/i);
  });
});

describe('filterListedConnections', () => {
  const rows = [
    { id: '1', protocol: 'rdp' },
    { id: '2', protocol: 'moonlight' },
    { id: '3', protocol: 'vnc' },
  ];

  it('keeps moonlight rows when the runtime is available', () => {
    assert.deepEqual(filterListedConnections(rows, true), rows);
  });

  it('omits moonlight rows when the runtime is unavailable (does not delete)', () => {
    assert.deepEqual(filterListedConnections(rows, false), [
      { id: '1', protocol: 'rdp' },
      { id: '3', protocol: 'vnc' },
    ]);
  });
});

describe('MOONLIGHT_MISSING_HINT', () => {
  it('mentions only ENABLE_MOONLIGHT=1', () => {
    assert.match(MOONLIGHT_MISSING_HINT, /ENABLE_MOONLIGHT=1/);
    assert.doesNotMatch(MOONLIGHT_MISSING_HINT, /MOONLIGHT_DOWNLOAD/);
    assert.doesNotMatch(MOONLIGHT_MISSING_HINT, /INCLUDE_MOONLIGHT/);
    assert.doesNotMatch(MOONLIGHT_MISSING_HINT, /MOONLIGHT_WEB_DIR/);
  });
});
