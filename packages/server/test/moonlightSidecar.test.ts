import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Alpine Gatwy does not execute moonlight-web', () => {
  const entrypoint = fs.readFileSync(path.join(root, 'entrypoint.sh'), 'utf8');
  const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
  const service = fs.readFileSync(path.join(root, 'packages/server/src/services/moonlightWeb.ts'), 'utf8');

  it('entrypoint does not install gcompat or fetch the gnu binary', () => {
    assert.doesNotMatch(entrypoint, /gcompat/);
    assert.doesNotMatch(entrypoint, /fetch-moonlight-web/);
    assert.doesNotMatch(entrypoint, /\/opt\/moonlight-web/);
  });

  it('Alpine Dockerfile does not copy the fetch helper', () => {
    assert.doesNotMatch(dockerfile, /fetch-moonlight-web/);
    assert.doesNotMatch(dockerfile, /gcompat/);
    assert.match(dockerfile, /FROM node:22-alpine/);
  });

  it('server proxies to the sidecar instead of spawning web-server', () => {
    assert.doesNotMatch(service, /child_process/);
    assert.doesNotMatch(service, /spawn\(/);
    assert.doesNotMatch(service, /127\.0\.0\.1:19080/);
    assert.match(service, /moonlight-web:19080/);
  });
});
