# DOBI SDKs

Every DOBI SDK does the same four things:

1. `register`  — `POST /api/devices/register` with a provision key
2. `heartbeat` — `POST /api/devices/<id>/heartbeat` with metrics
3. `poll`      — `GET  /api/devices/<id>/actions` for queued commands
4. `report`    — `POST /api/devices/<id>/actions/<id>/result`

One shared lifecycle, three runtimes:

| Runtime | Path | Notes |
|--|--|--|
| **Node** (Linux, RPi, containers) | [`node/`](./node/) | Zero-dep, native http/https. `dobi-sdk` on npm. |
| **Python** (RPi, Linux, anywhere Python 3.7+ runs) | [`python/`](./python/) | Zero-dep, stdlib urllib. `pip install dobi-sdk`. |
| **ESP32 / Arduino** | [`arduino/DobiESP32Example.ino`](./arduino/DobiESP32Example.ino) | Sketch template — WiFi + HTTPClient + ArduinoJson. |

The landing dialog on https://dobi.guru/app/devices also emits these snippets with your chosen provision key pre-filled.
