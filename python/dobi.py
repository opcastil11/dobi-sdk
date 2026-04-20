"""DOBI Device SDK for Python.

Single-file, stdlib-only (uses urllib). Drop on an RPi / Linux device / any
Python 3.7+ runtime and talk to the DOBI platform in ~20 lines.

Usage:

    from dobi import DobiDevice

    dev = DobiDevice(
        platform="https://dobi.guru",
        device_id="roof-sensor-01",
        device_name="Roof Temperature Sensor",
        device_type="iot_sensor",
        provision_key="my-secret-123",
    )

    import random
    dev.set_metric_collector(lambda: [
        {"name": "temperature", "value": round(20 + random.random()*5, 2), "unit": "C"},
        {"name": "humidity",    "value": round(40 + random.random()*20, 1), "unit": "%"},
    ])

    # Optional — handle a command queued by the dashboard / LLM.
    @dev.on_action("status_check")
    def _(params):
        return {"ok": True, "note": "reporting in"}

    dev.start()  # blocks
"""
from __future__ import annotations

import json
import logging
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Callable, Dict, List, Optional

__version__ = "0.1.0"

log = logging.getLogger("dobi")


class DobiDevice:
    def __init__(
        self,
        platform: str,
        device_id: str,
        device_name: Optional[str] = None,
        device_type: str = "iot_sensor",
        provision_key: str = "",
        heartbeat_interval: float = 30.0,
        dam_id: Optional[str] = None,
        timeout: float = 10.0,
    ) -> None:
        self.platform = platform.rstrip("/")
        self.device_id = device_id
        self.device_name = device_name or device_id
        self.device_type = device_type
        self.provision_key = provision_key
        self.heartbeat_interval = heartbeat_interval
        self.dam_id = dam_id
        self.timeout = timeout

        self._metric_collector: Callable[[], List[Dict[str, Any]]] = lambda: []
        self._action_handlers: Dict[str, Callable[[Dict[str, Any]], Any]] = {}
        self._running = False
        self._stop_event = threading.Event()

    # ─── Public API ─────────────────────────────────────────────────────
    def set_metric_collector(self, fn: Callable[[], List[Dict[str, Any]]]) -> None:
        """Function that returns the list of metric dicts to send each tick."""
        self._metric_collector = fn

    def on_action(self, action_type: str) -> Callable:
        """Decorator: register a handler for an RPC action_type."""
        def wrap(fn: Callable[[Dict[str, Any]], Any]) -> Callable:
            self._action_handlers[action_type] = fn
            return fn
        return wrap

    def register(self) -> Dict[str, Any]:
        body = {
            "provision_key": self.provision_key,
            "id_asset": self.device_id,
            "device_name": self.device_name,
            "device_type": self.device_type,
        }
        if self.dam_id:
            body["dam_id"] = self.dam_id
        return self._post("/api/devices/register", body)

    def heartbeat(self, metrics: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
        return self._post(
            f"/api/devices/{self.device_id}/heartbeat",
            {"metrics": metrics or [], "status": "active"},
        )

    def poll_actions(self) -> List[Dict[str, Any]]:
        res = self._get(f"/api/devices/{self.device_id}/actions")
        return res.get("data", []) if isinstance(res, dict) else []

    def report_action_result(self, action_id: Any, status: str, result: Dict[str, Any]) -> Dict[str, Any]:
        return self._post(
            f"/api/devices/{self.device_id}/actions/{action_id}/result",
            {"status": status, "result": result},
        )

    def start(self) -> None:
        """Blocking loop: register, then heartbeat + poll for actions forever."""
        self.register()
        log.info("[dobi] registered %s", self.device_id)
        self._running = True
        while self._running and not self._stop_event.is_set():
            try:
                self.heartbeat(self._metric_collector())
            except Exception as e:
                log.warning("[dobi] heartbeat failed: %s", e)
            try:
                actions = self.poll_actions()
                for a in actions:
                    self._handle_action(a)
            except Exception as e:
                log.warning("[dobi] action poll failed: %s", e)
            self._stop_event.wait(self.heartbeat_interval)

    def stop(self) -> None:
        self._running = False
        self._stop_event.set()

    # ─── Internals ──────────────────────────────────────────────────────
    def _handle_action(self, action: Dict[str, Any]) -> None:
        action_type = action.get("action_type")
        handler = self._action_handlers.get(action_type)
        if not handler:
            # Not implemented on this device — tell the platform so the UI /
            # LLM can distinguish "unimplemented" from "execution failed".
            self.report_action_result(
                action.get("id"),
                "failed",
                {"error": f"unhandled action type: {action_type}"},
            )
            return
        try:
            result = handler(action.get("parameters") or {}) or {"ok": True}
            self.report_action_result(action.get("id"), "completed", result)
        except Exception as e:  # noqa: BLE001
            self.report_action_result(
                action.get("id"), "failed", {"error": str(e)}
            )

    def _post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        req = urllib.request.Request(
            self.platform + path,
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        return self._send(req)

    def _get(self, path: str) -> Dict[str, Any]:
        req = urllib.request.Request(self.platform + path, method="GET")
        return self._send(req)

    def _send(self, req: urllib.request.Request) -> Dict[str, Any]:
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read()
        except urllib.error.HTTPError as e:
            # Parse the error body so the SDK raises something useful.
            body = e.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"HTTP {e.code}: {body}") from None
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except json.JSONDecodeError:
            return {"raw": raw.decode("utf-8", errors="replace")}


if __name__ == "__main__":
    # Minimal smoke test. Run:
    #   PLATFORM=https://dobi.guru KEY=test-$(date +%s) python3 dobi.py
    import os
    import random

    logging.basicConfig(level=logging.INFO)
    dev = DobiDevice(
        platform=os.environ.get("PLATFORM", "http://localhost:3137"),
        device_id=os.environ.get("DEVICE_ID", f"py-smoke-{int(time.time())}"),
        device_name="Python smoke sensor",
        device_type="iot_sensor",
        provision_key=os.environ.get("KEY", f"py-smoke-{int(time.time())}"),
        heartbeat_interval=10,
    )
    dev.set_metric_collector(lambda: [
        {"name": "temperature", "value": round(20 + random.random() * 5, 2), "unit": "C"},
    ])
    dev.start()
