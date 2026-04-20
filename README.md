# DOBI SDKs

Connect any IoT device to the [DOBI](https://dobi.guru) agent-native IoT platform. Every SDK does four things: register, heartbeat telemetry, poll for RPC commands, report results. Your device then shows up on the platform and can be chatted with via an LLM, monitored autonomously by a DAM agent, and monetized on-chain via x402.

![npm](https://img.shields.io/npm/v/@dobi/sdk?label=npm%20%40dobi%2Fsdk)
![pypi](https://img.shields.io/pypi/v/dobi?label=pypi%20dobi)
![license](https://img.shields.io/badge/license-MIT-blue)

## Pick your runtime

| Runtime | Path | Install |
|--|--|--|
| **Node.js 18+** (Linux / RPi / containers) | [`node/`](./node/) | `npm install @dobi/sdk` |
| **Python 3.7+** (RPi / Linux / anywhere) | [`python/`](./python/) | `pip install dobi` |
| **ESP32 / Arduino (C++)** | [`arduino/DobiESP32Example.ino`](./arduino/DobiESP32Example.ino) | Copy the `.ino` into your Arduino IDE |

## 20-line quickstart (Python)

```python
from dobi import DobiDevice
import random

dev = DobiDevice(
    platform="https://dobi.guru",
    device_id="roof-temp-01",
    device_type="iot_sensor",
    provision_key="your-secret-123",
)
dev.set_metric_collector(lambda: [
    {"name": "temperature", "value": round(20 + random.random()*5, 2), "unit": "C"},
])
dev.start()
```

Open `https://dobi.guru/app/devices/roof-temp-01` → **Chat** tab → ask "what's your temperature?"

## What DOBI gives you on top of "it heartbeats"

- **Chat-with-your-device** — ask plain-English questions grounded in the device's current metrics. Valid commands get queued as RPC actions automatically.
- **DAM agents** — bundle devices into a cluster, define alarm rules + cron schedules, let an LLM supervise them 24/7.
- **x402 monetization** — charge DOBI tokens per action call. See [`X402.md`](./X402.md).

## More

- [`QUICKSTART.md`](./QUICKSTART.md) — curl / Node / Python / ESP32 walkthrough
- [`X402.md`](./X402.md) — pay-per-use setup
- Platform source: <https://github.com/opcastil11/dobi-front-api>

## License

MIT
