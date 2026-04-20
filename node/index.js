/**
 * DOBI Device SDK — lightweight client for IoT devices (RPi, ESP32, etc.)
 *
 * Single-file, zero dependencies (uses native fetch in Node 18+ or http module).
 * Drop this file on any device that needs to connect to the DOBI platform.
 *
 * Usage:
 *   const { DobiDevice } = require('./dobi-device-sdk');
 *
 *   const device = new DobiDevice({
 *     platform: 'https://dobi.guru',
 *     deviceId: 'my-rpi-sensor-01',
 *     deviceName: 'Roof Temperature Sensor',
 *     deviceType: 'iot_sensor',           // charger | battery | solar_panel | wind_turbine | smart_meter | iot_sensor
 *     provisionKey: 'my-secret-key-123',  // shared secret for registration
 *     heartbeatInterval: 30000,           // ms between heartbeats (default 30s)
 *   });
 *
 *   // Set a function that returns your current metrics
 *   device.setMetricCollector(() => [
 *     { name: 'temperature', value: readTemp(), unit: 'C' },
 *     { name: 'humidity',    value: readHumidity(), unit: '%' },
 *   ]);
 *
 *   // Optionally handle incoming commands from the dashboard
 *   device.onAction('restart', async (params) => {
 *     console.log('Restarting...');
 *     return { restarted: true };
 *   });
 *
 *   // Start the agent loop
 *   device.start();
 *
 * That's it. The SDK handles:
 *   - Registration (POST /api/devices/register)
 *   - Heartbeat loop with metrics (POST /api/devices/:id/heartbeat)
 *   - Action polling (GET /api/devices/:id/actions)
 *   - Action execution + result reporting (POST /api/devices/:id/actions/:id/result)
 *   - Automatic reconnection on errors
 */

const http = require('http');
const https = require('https');

class DobiDevice {
  constructor(config) {
    this.platform = (config.platform || 'http://localhost:3137').replace(/\/$/, '');
    this.deviceId = config.deviceId;
    this.deviceName = config.deviceName || config.deviceId;
    this.deviceType = config.deviceType || 'iot_sensor';
    this.provisionKey = config.provisionKey || '';
    this.heartbeatInterval = config.heartbeatInterval || 30000;
    this.damId = config.damId || null;

    this._metricCollector = () => [];
    this._actionHandlers = new Map();
    this._running = false;
    this._timer = null;
  }

  /** Set the function that returns current device metrics. */
  setMetricCollector(fn) {
    this._metricCollector = fn;
    return this;
  }

  /** Register a handler for a specific action type. */
  onAction(actionType, handler) {
    this._actionHandlers.set(actionType, handler);
    return this;
  }

  /** Start the agent: register → heartbeat loop → action polling. */
  async start() {
    this._running = true;
    this._log('Starting DOBI device agent...');
    this._log(`  Platform:  ${this.platform}`);
    this._log(`  Device:    ${this.deviceId} (${this.deviceType})`);

    // Register
    try {
      const reg = await this._post('/api/devices/register', {
        id_asset: this.deviceId,
        name: this.deviceName,
        asset_type: this.deviceType,
        provision_key: this.provisionKey,
        dam_id: this.damId,
      });
      this._log(`Registered: ${JSON.stringify(reg.data || {})}`);
    } catch (err) {
      this._log(`Registration: ${err.message} (will retry via heartbeat)`);
    }

    // Heartbeat loop
    const beat = async () => {
      if (!this._running) return;
      await this._heartbeat();
      await this._pollActions();
    };
    await beat();
    this._timer = setInterval(beat, this.heartbeatInterval);

    this._log(`Agent running. Heartbeat every ${this.heartbeatInterval / 1000}s`);
  }

  /** Stop the agent gracefully. */
  stop() {
    this._running = false;
    if (this._timer) clearInterval(this._timer);
    this._log('Agent stopped.');
  }

  // ── internal ─────────────────────────────────────────────────────────

  async _heartbeat() {
    try {
      const metrics = this._metricCollector();
      await this._post(`/api/devices/${this.deviceId}/heartbeat`, {
        status: 'active',
        metrics: Array.isArray(metrics) ? metrics : [],
      });
    } catch (err) {
      this._log(`Heartbeat failed: ${err.message}`);
    }
  }

  async _pollActions() {
    try {
      const res = await this._get(`/api/devices/${this.deviceId}/actions`);
      const actions = (res && res.data) || [];
      for (const action of actions) {
        await this._executeAction(action);
      }
    } catch (err) {
      // Silently skip — endpoint may not exist yet
    }
  }

  async _executeAction(action) {
    const type = action.action_type;
    this._log(`Executing: ${type} (id=${action.id})`);

    let result;
    let status = 'completed';
    try {
      const handler = this._actionHandlers.get(type);
      if (handler) {
        const params = typeof action.parameters === 'string'
          ? JSON.parse(action.parameters) : (action.parameters || {});
        result = await handler(params, action);
      } else {
        result = { acknowledged: true, action_type: type, message: 'No handler registered' };
      }
    } catch (err) {
      status = 'failed';
      result = { error: err.message };
    }

    // Report result back
    try {
      await this._post(`/api/devices/${this.deviceId}/actions/${action.id}/result`, { status, result });
      this._log(`  ${status}: ${type}`);
    } catch (err) {
      this._log(`  Result report failed: ${err.message}`);
    }
  }

  // ── HTTP helpers (zero-dependency, works on Node 14+) ────────────────

  _post(path, body) {
    return this._request('POST', path, body);
  }

  _get(path) {
    return this._request('GET', path);
  }

  _request(method, path, body) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.platform);
      const mod = url.protocol === 'https:' ? https : http;
      const payload = body ? JSON.stringify(body) : null;

      const req = mod.request(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
        timeout: 15000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
      if (payload) req.write(payload);
      req.end();
    });
  }

  _log(msg) {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] [DOBI] ${msg}`);
  }
}

// ── Example usage (run this file directly to test) ──────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const platform = args.find(a => a.startsWith('--platform='))?.split('=')[1] || 'http://localhost:3137';
  const deviceId = args.find(a => a.startsWith('--device-id='))?.split('=')[1] || `rpi-${Date.now() % 100000}`;
  const key = args.find(a => a.startsWith('--key='))?.split('=')[1] || 'demo-key';
  const type = args.find(a => a.startsWith('--type='))?.split('=')[1] || 'iot_sensor';

  const device = new DobiDevice({
    platform,
    deviceId,
    deviceName: `RPi ${deviceId}`,
    deviceType: type,
    provisionKey: key,
    heartbeatInterval: 15000,
  });

  // Example metric collector — replace with real sensor reads
  device.setMetricCollector(() => [
    { name: 'temperature', value: +(20 + Math.random() * 15).toFixed(1), unit: 'C' },
    { name: 'humidity',    value: +(30 + Math.random() * 50).toFixed(1), unit: '%' },
    { name: 'cpu_temp',    value: +(40 + Math.random() * 20).toFixed(1), unit: 'C' },
  ]);

  // Example action handlers
  device.onAction('restart', async () => {
    console.log('>>> Simulating restart...');
    return { restarted: true };
  });

  device.onAction('status_check', async () => {
    return { status: 'ok', uptime_s: process.uptime() };
  });

  device.start().catch(console.error);

  process.on('SIGINT', () => device.stop());
  process.on('SIGTERM', () => device.stop());
}

module.exports = { DobiDevice };
