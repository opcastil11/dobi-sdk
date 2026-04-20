/*
 * DOBI ESP32 example — register + heartbeat + action polling.
 *
 * Libraries (install via Arduino Library Manager):
 *   - WiFi            (built in)
 *   - HTTPClient      (built in)
 *   - ArduinoJson     (Benoit Blanchon)
 *
 * Edit the six #defines below, flash, and open the Serial Monitor at 115200.
 * Your device will show up at https://dobi.guru/app/devices/<DEVICE_ID>
 * and you'll be able to chat with it in the Chat tab.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#define DOBI_PLATFORM      "https://dobi.guru"
#define WIFI_SSID          "YOUR_WIFI"
#define WIFI_PASSWORD      "YOUR_PASS"
#define DOBI_DEVICE_ID     "my-esp32-01"
#define DOBI_DEVICE_NAME   "Living room ESP32"
#define DOBI_PROVISION_KEY "change-me-to-a-secret"
#define DOBI_DEVICE_TYPE   "iot_sensor"   // charger | battery | solar_panel | iot_sensor | smart_meter | wind_turbine
#define DOBI_HEARTBEAT_MS  30000

static unsigned long lastTick = 0;

// Replace with real sensor reads. This example fakes them so the sketch
// compiles without any wiring.
static float readTemperatureC() { return 22.0 + (esp_random() % 100) / 10.0; }
static float readHumidityPct()  { return 45.0 + (esp_random() % 150) / 10.0; }

static bool httpPost(const String& url, const String& body, String& response) {
  HTTPClient http;
  if (!http.begin(url)) return false;
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(body);
  response = http.getString();
  http.end();
  return code >= 200 && code < 300;
}

static bool httpGet(const String& url, String& response) {
  HTTPClient http;
  if (!http.begin(url)) return false;
  int code = http.GET();
  response = http.getString();
  http.end();
  return code >= 200 && code < 300;
}

static void dobiRegister() {
  String body = String("{\"provision_key\":\"") + DOBI_PROVISION_KEY
              + "\",\"id_asset\":\"" + DOBI_DEVICE_ID
              + "\",\"device_name\":\"" + DOBI_DEVICE_NAME
              + "\",\"device_type\":\"" + DOBI_DEVICE_TYPE + "\"}";
  String resp;
  httpPost(String(DOBI_PLATFORM) + "/api/devices/register", body, resp);
  Serial.print("[DOBI] register: ");
  Serial.println(resp);
}

static void dobiHeartbeat() {
  float t = readTemperatureC();
  float h = readHumidityPct();
  String body = String("{\"metrics\":[{\"name\":\"temperature\",\"value\":")
              + String(t, 2) + ",\"unit\":\"C\"},"
              + "{\"name\":\"humidity\",\"value\":"
              + String(h, 2) + ",\"unit\":\"%\"}]}";
  String resp;
  bool ok = httpPost(String(DOBI_PLATFORM) + "/api/devices/" + DOBI_DEVICE_ID + "/heartbeat",
                     body, resp);
  Serial.print("[DOBI] heartbeat ");
  Serial.println(ok ? "ok" : "failed");
}

// Pull pending commands from /actions and call your own handler.
// This example only implements status_check — extend as needed.
static void dobiPollActions() {
  String resp;
  if (!httpGet(String(DOBI_PLATFORM) + "/api/devices/" + DOBI_DEVICE_ID + "/actions", resp)) return;

  StaticJsonDocument<2048> doc;
  if (deserializeJson(doc, resp)) return;

  JsonArray arr = doc["data"].as<JsonArray>();
  for (JsonObject action : arr) {
    long id = action["id"];
    const char* type = action["action_type"];
    Serial.print("[DOBI] action ");
    Serial.print(id);
    Serial.print(" type=");
    Serial.println(type);

    // Respond. Replace with real logic per device type.
    String result;
    String status;
    if (strcmp(type, "status_check") == 0) {
      status = "completed";
      result = String("{\"ok\":true,\"temperature\":") + String(readTemperatureC(), 2) + "}";
    } else {
      status = "failed";
      result = String("{\"error\":\"unhandled action: ") + type + "\"}";
    }
    String body = String("{\"status\":\"") + status + "\",\"result\":" + result + "}";
    String ignored;
    httpPost(String(DOBI_PLATFORM) + "/api/devices/" + DOBI_DEVICE_ID + "/actions/" + id + "/result",
             body, ignored);
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi ");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" connected");
  dobiRegister();
  lastTick = millis() - DOBI_HEARTBEAT_MS;  // fire immediately
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(1000);
    return;
  }
  if (millis() - lastTick >= DOBI_HEARTBEAT_MS) {
    dobiHeartbeat();
    dobiPollActions();
    lastTick = millis();
  }
  delay(200);
}
