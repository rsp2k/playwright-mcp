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

import { z } from 'zod';
import { defineTool, defineTabTool } from './tool.js';

/**
 * Start WebRTC monitoring by intercepting RTCPeerConnection.
 */
const startWebRTCMonitoring = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_start_webrtc_monitoring',
    title: 'Start WebRTC monitoring',
    description: 'Enable real-time WebRTC connection monitoring. Intercepts RTCPeerConnection API to track connection states and collect statistics. Required before using other WebRTC tools.',
    inputSchema: z.object({
      statsPollingInterval: z.coerce.number().optional().describe('Stats collection interval in milliseconds (default: 1000ms). Lower values give more frequent updates but use more CPU.'),
    }),
    type: 'destructive',
  },

  handle: async (tab, params, response) => {
    if (tab.isRTCMonitoringEnabled()) {
      response.addResult('⚠️ WebRTC monitoring is already enabled for this tab.');
      return;
    }

    await tab._initializeRTCMonitoring();

    const interval = params.statsPollingInterval || 1000;
    tab.enableRTCStatsPolling(interval);

    response.addResult(`✅ WebRTC monitoring enabled
  • Stats polling interval: ${interval}ms
  • All new RTCPeerConnection instances will be monitored
  • Use browser_get_webrtc_connections to view connections`);
  },
});

/**
 * Get WebRTC connections with state filtering.
 */
const getWebRTCConnections = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_get_webrtc_connections',
    title: 'Get WebRTC connections',
    description: 'List all WebRTC connections captured during this session. Shows connection states, ICE states, and origin. Use browser_get_webrtc_stats for detailed statistics.',
    inputSchema: z.object({
      connectionState: z.enum(['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed']).optional()
        .describe('Filter by connection state'),
      iceConnectionState: z.enum(['new', 'checking', 'connected', 'completed', 'failed', 'disconnected', 'closed']).optional()
        .describe('Filter by ICE connection state'),
      origin: z.string().optional().describe('Filter by origin URL'),
    }),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    let connections = context.rtcConnections();

    // Apply filters
    if (params.connectionState)
      connections = connections.filter(c => c.connectionState === params.connectionState);

    if (params.iceConnectionState)
      connections = connections.filter(c => c.iceConnectionState === params.iceConnectionState);

    if (params.origin) {
      const originFilter = params.origin;
      connections = connections.filter(c => c.origin.includes(originFilter));
    }


    if (connections.length === 0) {
      response.addResult('No WebRTC connections found. Use browser_start_webrtc_monitoring to enable monitoring.');
      return;
    }

    const result = ['### WebRTC Connections', ''];

    for (const conn of connections) {
      const age = Math.round((Date.now() - conn.timestamp) / 1000);
      const hostname = new URL(conn.origin).hostname;

      result.push(`**Connection ${conn.id}**`);
      result.push(`  • Origin: ${hostname}`);
      result.push(`  • Age: ${age}s`);
      result.push(`  • Connection State: \`${conn.connectionState}\``);
      result.push(`  • ICE Connection: \`${conn.iceConnectionState}\``);
      result.push(`  • ICE Gathering: \`${conn.iceGatheringState}\``);
      result.push(`  • Signaling: \`${conn.signalingState}\``);

      if (conn.lastStats && conn.lastStatsTimestamp) {
        const statsAge = Math.round((Date.now() - conn.lastStatsTimestamp) / 1000);
        result.push(`  • Last Stats: ${statsAge}s ago`);
      }

      result.push('');
    }

    response.addResult(result.join('\n'));
  },
});

/**
 * Get detailed WebRTC stats for specific connections.
 */
const getWebRTCStats = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_get_webrtc_stats',
    title: 'Get WebRTC statistics',
    description: 'Get detailed real-time statistics for WebRTC connections. Includes bitrate, packet loss, jitter, RTT, frames per second, and quality metrics. Essential for diagnosing call quality issues.',
    inputSchema: z.object({
      connectionId: z.string().optional().describe('Specific connection ID (from browser_get_webrtc_connections). If omitted, shows stats for all connections.'),
      includeRaw: z.boolean().optional().describe('Include raw stats data for debugging (default: false)'),
    }),
    type: 'readOnly',
  },

  handle: async (context, params, response) => {
    let connections = context.rtcConnections();

    if (params.connectionId) {
      const conn = context.getRTCConnection(params.connectionId);
      if (!conn)
        throw new Error(`Connection "${params.connectionId}" not found. Use browser_get_webrtc_connections to list connections.`);

      connections = [conn];
    }

    if (connections.length === 0) {
      response.addResult('No WebRTC connections found.');
      return;
    }

    const result = ['### WebRTC Statistics', ''];

    for (const conn of connections) {
      result.push(`## Connection ${conn.id}`);
      result.push(`Origin: ${new URL(conn.origin).hostname}`);
      result.push('');

      if (!conn.lastStats) {
        result.push('_No statistics collected yet. Stats polling may not be enabled._');
        result.push('');
        continue;
      }

      const stats = conn.lastStats;

      // Inbound Video
      if (stats.inboundVideo) {
        result.push('**Inbound Video**');
        result.push(`  • Bitrate: ${stats.inboundVideo.bitrate.toFixed(2)} Mbps`);
        result.push(`  • Packet Loss: ${stats.inboundVideo.packetLossRate.toFixed(2)}%`);
        result.push(`  • Jitter: ${stats.inboundVideo.jitter.toFixed(2)} ms`);
        if (stats.inboundVideo.framesPerSecond)
          result.push(`  • FPS: ${stats.inboundVideo.framesPerSecond}`);

        if (stats.inboundVideo.frameWidth && stats.inboundVideo.frameHeight)
          result.push(`  • Resolution: ${stats.inboundVideo.frameWidth}x${stats.inboundVideo.frameHeight}`);

        if (stats.inboundVideo.freezeCount)
          result.push(`  • Freezes: ${stats.inboundVideo.freezeCount} (${stats.inboundVideo.totalFreezesDuration?.toFixed(1)}s total)`);

        result.push('');
      }

      // Inbound Audio
      if (stats.inboundAudio) {
        result.push('**Inbound Audio**');
        result.push(`  • Bitrate: ${stats.inboundAudio.bitrate.toFixed(2)} Mbps`);
        result.push(`  • Packet Loss: ${stats.inboundAudio.packetLossRate.toFixed(2)}%`);
        result.push(`  • Jitter: ${stats.inboundAudio.jitter.toFixed(2)} ms`);
        if (stats.inboundAudio.audioLevel !== undefined)
          result.push(`  • Audio Level: ${(stats.inboundAudio.audioLevel * 100).toFixed(1)}%`);

        result.push('');
      }

      // Outbound Video
      if (stats.outboundVideo) {
        result.push('**Outbound Video**');
        result.push(`  • Bitrate: ${stats.outboundVideo.bitrate.toFixed(2)} Mbps`);
        if (stats.outboundVideo.framesPerSecond)
          result.push(`  • FPS: ${stats.outboundVideo.framesPerSecond}`);

        if (stats.outboundVideo.frameWidth && stats.outboundVideo.frameHeight)
          result.push(`  • Resolution: ${stats.outboundVideo.frameWidth}x${stats.outboundVideo.frameHeight}`);

        if (stats.outboundVideo.qualityLimitationReason && stats.outboundVideo.qualityLimitationReason !== 'none')
          result.push(`  • ⚠️ Quality Limited By: ${stats.outboundVideo.qualityLimitationReason}`);

        result.push('');
      }

      // Outbound Audio
      if (stats.outboundAudio) {
        result.push('**Outbound Audio**');
        result.push(`  • Bitrate: ${stats.outboundAudio.bitrate.toFixed(2)} Mbps`);
        result.push('');
      }

      // Candidate Pair
      if (stats.candidatePair) {
        result.push('**Connection Info**');
        result.push(`  • ICE State: ${stats.candidatePair.state}`);
        result.push(`  • Local Candidate: ${stats.candidatePair.localCandidateType}`);
        result.push(`  • Remote Candidate: ${stats.candidatePair.remoteCandidateType}`);
        if (stats.candidatePair.currentRoundTripTime !== undefined)
          result.push(`  • RTT: ${(stats.candidatePair.currentRoundTripTime * 1000).toFixed(2)} ms`);

        if (stats.candidatePair.availableOutgoingBitrate)
          result.push(`  • Available Bandwidth: ${(stats.candidatePair.availableOutgoingBitrate / 1000000).toFixed(2)} Mbps`);

        result.push('');
      }
    }

    response.addResult(result.join('\n'));
  },
});

/**
 * Stop WebRTC monitoring and stats polling.
 */
const stopWebRTCMonitoring = defineTabTool({
  capability: 'core',

  schema: {
    name: 'browser_stop_webrtc_monitoring',
    title: 'Stop WebRTC monitoring',
    description: 'Stop collecting WebRTC statistics. Captured connection data is preserved and can still be queried. Use browser_clear_webrtc_data to also clear historical data.',
    inputSchema: z.object({}),
    type: 'destructive',
  },

  handle: async (tab, _params, response) => {
    if (!tab.isRTCMonitoringEnabled()) {
      response.addResult('WebRTC monitoring is not currently enabled.');
      return;
    }

    tab.disableRTCStatsPolling();

    const count = tab.rtcConnections().length;
    response.addResult(`✅ WebRTC monitoring stopped
  • Stats polling disabled
  • ${count} connection(s) preserved in history
  • Use browser_clear_webrtc_data to clear history`);
  },
});

/**
 * Clear all WebRTC data.
 */
const clearWebRTCData = defineTool({
  capability: 'core',

  schema: {
    name: 'browser_clear_webrtc_data',
    title: 'Clear WebRTC data',
    description: 'Clear all captured WebRTC connection data and statistics from session history. Also stops monitoring if active.',
    inputSchema: z.object({}),
    type: 'destructive',
  },

  handle: async (context, _params, response) => {
    const count = context.rtcConnections().length;
    context.clearRTCConnections();

    response.addResult(`✅ Cleared ${count} WebRTC connection(s) from history.`);
  },
});

export default [
  startWebRTCMonitoring,
  getWebRTCConnections,
  getWebRTCStats,
  stopWebRTCMonitoring,
  clearWebRTCData,
];
