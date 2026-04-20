# dobi-sdk

Single-file Node SDK for the [DOBI](https://dobi.guru) agent-native IoT platform. Zero dependencies, works on Node 18+ (RPi, VPS, any Linux container).

## Install

```bash
npm install dobi-sdk
# or drop sdks/node/index.js into your project — it has no dependencies
```

## 20 lines to chat with your device

```js
const { DobiDevice } = require('dobi-sdk');

const device = new DobiDevice({
  platform: 'https://dobi.guru',
  deviceId: 'roof-temp-01',
  deviceName: 'Roof temperature sensor',
  deviceType: 'iot_sensor',          // charger | battery | solar_panel | wind_turbine | smart_meter | iot_sensor
  provisionKey: 'your-secret-here',  // generate yours on dobi.guru
  heartbeatInterval: 30000,
});

device.setMetricCollector(() => [
  { name: 'temperature', value: readTemp(), unit: 'C' },
  { name: 'humidity',    value: readHumidity(), unit: '%' },
]);

// Optionally react to commands queued by the dashboard or LLM chat
device.onAction('status_check', async () => ({ ok: true }));

device.start();  // registers, then heartbeats + polls for commands forever
```

Once your device has heartbeated, open `https://dobi.guru/app/devices/<deviceId>` and chat with it.

## Why not just roll your own HTTP client?

This SDK handles the boring parts so you can focus on sensors:

- Idempotent registration (safe to re-run on reboot)
- Automatic reconnection + backoff
- Action polling with a handler map (no if/else chains)
- Result reporting (so the platform knows `status: 'completed' | 'failed'`)
- Runs on `http`/`https` native modules — no `node-fetch`, no `axios`

## API

See [`index.d.ts`](./index.d.ts) for the full typed surface.

## Related packages

- **Python**: [`pip install dobi-sdk`](../python/README.md)
- **ESP32 / Arduino**: see the [ESP32 snippet](https://dobi.guru/app/devices) in the onboarding dialog on the dashboard

## License

MIT
