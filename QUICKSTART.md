# DOBI quickstart — chat with your IoT device in 60 seconds

Anything that can make an HTTPS request can talk to DOBI. Below is the fastest path for each runtime. Full reference in [`../sdks/README.md`](../sdks/README.md).

## Prereqs

- A device: ESP32 / RPi / Arduino / laptop — anything with internet.
- A **provision key** (a random string you pick; keep it on the device, never commit it). You can also generate one in the onboarding dialog at https://dobi.guru/app/devices.

## 1. Register + heartbeat (curl)

```bash
KEY="my-secret-$(date +%s)"
ID="roof-temp-01"

# One-time registration (idempotent — safe to re-run on reboot)
curl -X POST https://dobi.guru/api/devices/register \
  -H 'Content-Type: application/json' \
  -d "{
    \"provision_key\": \"$KEY\",
    \"id_asset\":      \"$ID\",
    \"device_name\":   \"Roof temperature sensor\",
    \"device_type\":   \"iot_sensor\"
  }"

# Heartbeat — send this every 30s with your real sensor data
curl -X POST "https://dobi.guru/api/devices/$ID/heartbeat" \
  -H 'Content-Type: application/json' \
  -d '{"metrics":[
        {"name":"temperature","value":22.5,"unit":"C"},
        {"name":"humidity",   "value":60,  "unit":"%"}
      ]}'
```

Your device now lives at `https://dobi.guru/app/devices/roof-temp-01`.

## 2. Chat with it

Open the device detail page → **Chat** tab. Ask "what's your temperature?" — the LLM answers using the metrics you just sent.

Or programmatically:

```bash
curl -X POST https://dobi.guru/api/devices/roof-temp-01/chat \
  -H 'Content-Type: application/json' \
  -d '{"message": "how are you?"}'
```

Returns `{ "reply": "…", "source": "llm:openai", "action_queued": null }`.

## 3. React to commands

The dashboard (or the LLM on your behalf) queues actions via `POST /api/devices/:id/actions`. Your device polls `GET /api/devices/:id/actions`, executes them, and reports results via `POST /api/devices/:id/actions/:actionId/result`.

Every device type has a catalog of valid actions:

```bash
curl https://dobi.guru/api/devices/roof-temp-01/actions/catalog
```

Returns the list of action types, human labels, descriptions, and parameter schemas. The LLM chat only queues actions that exist in your catalog.

## 4. Automate with a DAM

A **DAM** (Decentralized Autonomous Machine) is an AI agent that watches a cluster of devices and acts on them autonomously — fires alarms on threshold breaches, runs scheduled cron tasks, and lets you issue plain-English orders like "reduce power on chargers idle for >10 min."

Create one at https://dobi.guru/app/dams/new, link your device(s), write a system prompt + alarm rules.

## 5. Monetize (optional)

Enable **x402 pay-per-use** on a device to charge DOBI tokens (on Base) per action invocation. See [`X402.md`](./X402.md).

## Troubleshooting

- **`value too long for type character varying(42)`** — you're on a very old version. The current backend hashes your provision key internally to fit.
- **`heartbeat rate limit exceeded`** — you're sending more than 600/min from one IP. Back off.
- **Chat says "LLM temporarily unavailable"** — platform OpenAI key hit a limit. Fallback replies come from device state.
