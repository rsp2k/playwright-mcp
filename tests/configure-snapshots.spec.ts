/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from './fixtures.js';

// Regression tests for the config identity-drift bug fixed in 7dafb6b.
//
// Shape of the bug: browser_configure's updateBrowserConfig did
//   (this as any).config = currentConfig
// which REASSIGNED Context.config to a clone. After that call,
// backend._config (which Response reads at construction) kept pointing
// at the ORIGINAL config object, while updateSnapshotConfig mutated the
// clone. Flag changes landed on the clone and Response never saw them.
//
// A naive test with a browser_configure_snapshots call as its first act
// passes on the broken build — the reassignment hasn't happened yet.
//
// The matrix below is 2x2: trigger-present × direction-asked. Each test
// is a single cell. The failure signature across cells diagnoses the
// shape of a regression rather than just raising an alarm:
//
//   drift reintroduced     → both WITH_TRIGGER cells fail, baselines pass
//   suppression stuck on   → both ASKED_TRUE cells fail
//   suppression stuck off  → both ASKED_FALSE cells fail
//   flag read ignored      → one of each direction fails
//
// The baseline cells (no trigger) are not redundant: they catch
// "suppression never works" and "snapshots never come back", which
// the with-trigger cells can't distinguish from drift.

const PAGE = '<title>Hi</title><body>Hello</body>';

test('includeSnapshots:false suppresses snapshot (no trigger)', async ({ client, server }) => {
  server.setContent('/', PAGE, 'text/html');
  await client.callTool({
    name: 'browser_configure_snapshots',
    arguments: { includeSnapshots: false },
  });
  const result = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });
  expect(result).not.toContainTextContent('Page Snapshot');
});

test('includeSnapshots:true restores snapshot (no trigger)', async ({ client, server }) => {
  server.setContent('/', PAGE, 'text/html');
  // Flip off first so we're asking for a change rather than the default.
  await client.callTool({
    name: 'browser_configure_snapshots',
    arguments: { includeSnapshots: false },
  });
  await client.callTool({
    name: 'browser_configure_snapshots',
    arguments: { includeSnapshots: true },
  });
  const result = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });
  expect(result).toContainTextContent('Page Snapshot');
});

test('includeSnapshots:false suppresses snapshot after browser_configure trigger', async ({ client, server }) => {
  server.setContent('/', PAGE, 'text/html');
  // The trigger — on the broken build this reassigns Context.config to a
  // clone that drifts from backend._config, and the next flag change is lost.
  await client.callTool({
    name: 'browser_configure',
    arguments: { viewport: { width: 1440, height: 900 } },
  });
  await client.callTool({
    name: 'browser_configure_snapshots',
    arguments: { includeSnapshots: false },
  });
  const result = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });
  expect(result).not.toContainTextContent('Page Snapshot');
});

test('includeSnapshots:true restores snapshot after browser_configure trigger', async ({ client, server }) => {
  server.setContent('/', PAGE, 'text/html');
  // Flip off first so we're asking true for a change, not the default.
  await client.callTool({
    name: 'browser_configure_snapshots',
    arguments: { includeSnapshots: false },
  });
  // Trigger between the two flag changes — the mirror of the case above.
  await client.callTool({
    name: 'browser_configure',
    arguments: { viewport: { width: 1441, height: 900 } },
  });
  await client.callTool({
    name: 'browser_configure_snapshots',
    arguments: { includeSnapshots: true },
  });
  const result = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });
  // On broken build this one fails — the :true request lands on the
  // Context clone while Response keeps reading the orphaned original
  // where :false was last written. "Snapshot stays gone" was the
  // original diagnostic trap: no snapshot block looks identical to
  // "the flag is working beautifully".
  expect(result).toContainTextContent('Page Snapshot');
});
