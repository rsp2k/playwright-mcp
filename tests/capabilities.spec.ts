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

test('test snapshot tool list', async ({ client }) => {
  const { tools } = await client.listTools();
  expect(new Set(tools.map(t => t.name))).toEqual(new Set([
    'browser_clear_device_motion',
    'browser_clear_device_orientation',
    'browser_clear_injections',
    'browser_clear_webrtc_data',
    'browser_clear_notifications',
    'browser_clear_permissions',
    'browser_clear_requests',
    'browser_click',
    'browser_close',
    'browser_configure',
    'browser_configure_artifacts',
    'browser_configure_notifications',
    'browser_configure_snapshots',
    'browser_console_messages',
    'browser_disable_debug_toolbar',
    'browser_dismiss_all_file_choosers',
    'browser_dismiss_file_chooser',
    'browser_drag',
    'browser_enable_debug_toolbar',
    'browser_enable_voice_collaboration',
    'browser_evaluate',
    'browser_export_requests',
    'browser_file_upload',
    'browser_get_artifact_paths',
    'browser_get_requests',
    'browser_get_webrtc_connections',
    'browser_get_webrtc_stats',
    'browser_grant_permissions',
    'browser_handle_dialog',
    'browser_handle_notification',
    'browser_hover',
    'browser_inject_custom_code',
    'browser_install',
    'browser_install_extension',
    'browser_install_popular_extension',
    'browser_list_devices',
    'browser_list_extensions',
    'browser_list_injections',
    'browser_list_notifications',
    'browser_mcp_theme_create',
    'browser_mcp_theme_get',
    'browser_mcp_theme_list',
    'browser_mcp_theme_reset',
    'browser_mcp_theme_set',
    'browser_navigate',
    'browser_navigate_back',
    'browser_navigate_forward',
    'browser_network_requests',
    'browser_pause_recording',
    'browser_press_key',
    'browser_recording_status',
    'browser_request_monitoring_status',
    'browser_resize',
    'browser_resume_recording',
    'browser_reveal_artifact_paths',
    'browser_select_option',
    'browser_set_device_motion',
    'browser_set_device_orientation',
    'browser_set_geolocation',
    'browser_set_offline',
    'browser_set_recording_mode',
    'browser_snapshot',
    'browser_start_recording',
    'browser_start_request_monitoring',
    'browser_start_webrtc_monitoring',
    'browser_status',
    'browser_stop_recording',
    'browser_stop_webrtc_monitoring',
    'browser_tab_close',
    'browser_tab_list',
    'browser_tab_new',
    'browser_tab_select',
    'browser_take_screenshot',
    'browser_type',
    'browser_uninstall_extension',
    'browser_wait_for',
    'browser_wait_notification',
  ]));
});

test('test capabilities (pdf)', async ({ startClient }) => {
  const { client } = await startClient({
    args: ['--caps=pdf'],
  });
  const { tools } = await client.listTools();
  const toolNames = tools.map(t => t.name);
  expect(toolNames).toContain('browser_pdf_save');
});

test('test capabilities (vision)', async ({ startClient }) => {
  const { client } = await startClient({
    args: ['--caps=vision'],
  });
  const { tools } = await client.listTools();
  const toolNames = tools.map(t => t.name);
  expect(toolNames).toContain('browser_mouse_move_xy');
  expect(toolNames).toContain('browser_mouse_click_xy');
  expect(toolNames).toContain('browser_mouse_drag_xy');
});

test('support for legacy --vision option', async ({ startClient }) => {
  const { client } = await startClient({
    args: ['--vision'],
  });
  const { tools } = await client.listTools();
  const toolNames = tools.map(t => t.name);
  expect(toolNames).toContain('browser_mouse_move_xy');
  expect(toolNames).toContain('browser_mouse_click_xy');
  expect(toolNames).toContain('browser_mouse_drag_xy');
});
