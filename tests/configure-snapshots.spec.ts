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

// Regression tests for the identity-drift bug fixed in 7dafb6b.
//
// browser_configure's updateBrowserConfig previously did
//   (this as any).config = currentConfig
// which REASSIGNED Context.config to a clone, orphaning backend._config
// (which Response reads at construction). Subsequent updateSnapshotConfig
// calls mutated the Context's clone while Response kept reading the
// orphan. includeSnapshots:false (or :true) became silently inert.
//
// A naive test calling browser_configure_snapshots FIRST passes on the
// broken build because the reassignment hasn't happened yet. These tests
// put browser_configure UPSTREAM of every includeSnapshots change, which
// is the shape that exercises the drift.

test('browser_configure_snapshots suppresses snapshot after browser_configure', async ({ client, server }) => {
  server.setContent('/', '<title>Hi</title><body>Hello</body>', 'text/html');

  // Step 1: browser_configure triggers the config reassignment on the
  // broken build. Must come before any includeSnapshots change.
  await client.callTool({
    name: 'browser_configure',
    arguments: { viewport: { width: 1440, height: 900 } },
  });

  // Step 2: Ask for snapshots off. On broken build this landed on the
  // Context clone while Response kept reading the orphaned original.
  await client.callTool({
    name: 'browser_configure_snapshots',
    arguments: { includeSnapshots: false },
  });

  // Step 3: Navigate — snapshot MUST NOT appear.
  const navResult = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });
  expect(navResult).not.toContainTextContent('Page Snapshot');
});

test('browser_configure_snapshots restores snapshot in the OTHER direction', async ({ client, server }) => {
  // The mirror case. If the test above were the only one, a hypothetical
  // bug that "forces snapshots off whenever browser_configure runs" would
  // pass it. This case freezes the config at :false first, then uses the
  // trigger, then asks for :true — the broken build keeps it suppressed.
  server.setContent('/', '<title>Hi</title><body>Hello</body>', 'text/html');

  await client.callTool({
    name: 'browser_configure_snapshots',
    arguments: { includeSnapshots: false },
  });

  // The trigger — reassignment happens here on the broken build.
  await client.callTool({
    name: 'browser_configure',
    arguments: { viewport: { width: 1441, height: 900 } },
  });

  // Ask for snapshots back on.
  await client.callTool({
    name: 'browser_configure_snapshots',
    arguments: { includeSnapshots: true },
  });

  const navResult = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });
  // On broken build, the config object Response reads was frozen at
  // :false by the pre-trigger step. The :true request landed on the
  // Context clone and never reached Response. Snapshot would stay gone.
  expect(navResult).toContainTextContent('Page Snapshot');
});

test('browser_configure_snapshots works WITHOUT the trigger (baseline, must not stand alone)', async ({ client, server }) => {
  // Round 2 from the peer repro: a server with no browser_configure call
  // never trips the reassignment, so the flag works both ways on the
  // broken build too. This test is deliberately kept to document that
  // the trigger IS the discriminator — if this one passes but the two
  // above fail, the bug is the one 7dafb6b fixed.
  server.setContent('/', '<title>Hi</title><body>Hello</body>', 'text/html');

  await client.callTool({
    name: 'browser_configure_snapshots',
    arguments: { includeSnapshots: false },
  });

  const navOff = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });
  expect(navOff).not.toContainTextContent('Page Snapshot');

  await client.callTool({
    name: 'browser_configure_snapshots',
    arguments: { includeSnapshots: true },
  });

  const navOn = await client.callTool({
    name: 'browser_navigate',
    arguments: { url: server.PREFIX },
  });
  expect(navOn).toContainTextContent('Page Snapshot');
});
