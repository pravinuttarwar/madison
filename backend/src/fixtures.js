// TEST-ONLY fixture loader (MBI-34). When FIXTURES_DIR is set (config.fixturesMode),
// graph.js/qbo.js resolve from synthetic upstream payloads under that directory instead of
// calling Microsoft/Intuit — so the gate exercises the real route + transforms path offline.
// Gated by config.fixturesMode; never active in production.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

export function loadFixture(...parts) {
  return JSON.parse(readFileSync(join(config.fixturesDir, ...parts), 'utf8'));
}
