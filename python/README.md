# DOBI Python SDK

Single-file, stdlib-only. Works on Raspberry Pi, Linux, macOS, Windows — anywhere Python 3.7+ runs.

## Install

```bash
pip install dobi
# or drop dobi.py into your project directly (zero deps, just stdlib urllib)
```

## 20 lines to chat with your device

```python
from dobi import DobiDevice
import random

dev = DobiDevice(
    platform="https://dobi.guru",
    device_id="roof-temp-01",
    device_name="Roof temperature sensor",
    device_type="iot_sensor",
    provision_key="your-secret-here",   # generate yours on dobi.guru
    heartbeat_interval=30,
)

dev.set_metric_collector(lambda: [
    {"name": "temperature", "value": round(20 + random.random()*5, 2), "unit": "C"},
    {"name": "humidity",    "value": round(40 + random.random()*20, 1), "unit": "%"},
])

# Optional — respond to commands queued by the dashboard or LLM chat
@dev.on_action("status_check")
def _(params):
    return {"ok": True}

dev.start()   # blocks: registers, then heartbeats + polls for actions forever
```

Once your device has heartbeated, open `https://dobi.guru/app/devices/<device_id>` and chat with it. Every question is grounded in the metrics you just sent.

## What the SDK does

| Method | Endpoint it hits |
|--|--|
| `.register()` | `POST /api/devices/register` |
| `.heartbeat(metrics)` | `POST /api/devices/<id>/heartbeat` |
| `.poll_actions()` | `GET  /api/devices/<id>/actions` |
| `.report_action_result(...)` | `POST /api/devices/<id>/actions/<id>/result` |

`start()` runs the full loop. `stop()` ends it cleanly.

## License

MIT
