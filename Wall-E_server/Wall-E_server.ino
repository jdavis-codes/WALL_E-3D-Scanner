#include <Arduino.h>
#include <SPIFFS.h>            // esp32 file system for storing Webpage Code
#include <WiFi.h>              // wifi library
#include <ESPAsyncWebServer.h> // webserver / websocket library for esp32
#include <ArduinoJson.h>       // used to parse JSON web messages
#include <Servo.h>             // control
#include <esp_wifi.h>          // 
#include "RunningAverage.h"

//WIFI SETUP///////////////////////////////////////////////////

#define HTTP_PORT 80
uint8_t newMACAddress[] = {0x32, 0xAE, 0xA4, 0x07, 0x0D, 0x66};

const char *WIFI_SSID = "OLIN-DEVICES";
const char *WIFI_PASS = "Design&Fabric8";

AsyncWebServer server(HTTP_PORT);
AsyncWebSocket ws("/ws");

//PIN DECLARATIONS////////////////////////////////////////////

const int ledPin =  LED_BUILTIN;
const int panPin =  25;
const int tiltPin =  26;
const int irPin =  36;

//HARDWARE STRUCTURES/////////////////////////////////////////
// Hardware structures which provide state tracking for lights and servos

struct Led {
    // state variables
    uint8_t pin;
    bool    on;

    // methods
    void update() {
        digitalWrite(pin, on ? HIGH : LOW);
    }
};

struct Motor {
  // state variables
  uint8_t pin;
  int angle;
  struct Servo servo;

  // methods
  void attach(){
    servo.attach(pin);
  }
  void update(){
    servo.write(angle);
  }
};

struct IRsensor {
  //state variables
  uint8_t pin;
  int reading;

  //methods
  void read(){
    reading = analogRead(pin);
  }
};

// declares instances of the hardware stuctures

Led      onboard_led = { LED_BUILTIN, false };
Motor    pan  = {panPin, 0};
Motor    tilt = {tiltPin, 0};
IRsensor ir = {irPin,0};

RunningAverage myRA(10);  // Creates a running average object used
int samples = 0;          // tracks number of samples in the running average

void setup() {

    // Intialize digital outputs for Light and Servo

    pinMode(onboard_led.pin, OUTPUT);
    pan.attach();
    tilt.attach();
    
    Serial.begin(115200); delay(500);

    // Start file system for the webserver which stores html, css, 
    // and javascript files of the web interface
    
    SPIFFS.begin();
    
    // Establish a wifi connection, and prints the IP adress. 
    // To acess WALL-E's interface, connect to Olin 
    // Devices and type the IP adress into your browser
    
    WiFi.mode(WIFI_STA);
    esp_wifi_set_mac(WIFI_IF_STA, &newMACAddress[0]);
    WiFi.begin(WIFI_SSID, WIFI_PASS);
    Serial.printf("Trying to connect [%s] ", WiFi.macAddress().c_str());
    while (WiFi.status() != WL_CONNECTED) {
        Serial.print(".");
        delay(500);
    }
    Serial.printf(" %s\n", WiFi.localIP().toString().c_str());

    // Begin Websocket connection. Websockets are used for realtime 
    // low-latency communication from WALL-E to the Browser
    
    ws.onEvent(onEvent);
    server.addHandler(&ws);

    // Deliver Interfacefiles on root reuest
    
    server.on("/", onRootRequest);
    server.serveStatic("/", SPIFFS, "/");
    server.begin();
}

void loop() {
    ws.cleanupClients(); //Removes Disconnected Websocket Clients
    
    ir.read(); //
    
    myRA.addValue(ir.reading);
    samples++;
    
    if (samples == 100)
    {
      Serial.print("\t Running Average: ");
      Serial.println(myRA.getAverage(), 3);

      ws.textAll(String(myRA.getAverage()));
      
      samples = 0;
      myRA.clear();
    }

    onboard_led.update();
}

void handleWebSocketMessage(void *arg, uint8_t *data, size_t len) {
    AwsFrameInfo *info = (AwsFrameInfo*)arg;
    if (info->final && info->index == 0 && info->len == len && info->opcode == WS_TEXT) {

        const uint8_t size = JSON_OBJECT_SIZE(2);
        StaticJsonDocument<size> json;
        DeserializationError err = deserializeJson(json, data);
        if (err) {
            Serial.print(F("deserializeJson() failed with code "));
            Serial.println(err.c_str());
            return;
        }

        const char *action = json["action"];
        int val = json["val"];
        if (strcmp(action, "toggle") == 0) {
            Serial.println(val);
            onboard_led.on = !onboard_led.on;
            notifyClients();
        }
        if (strcmp(action, "pan") == 0) {
            Serial.println(val);
            pan.angle = val;
            pan.update();
            //notifyClients();
        }

        if (strcmp(action, "tilt") == 0) {
            Serial.println(val);
            tilt.angle = val;
            tilt.update();
            //notifyClients();
        }

    }
}

float calibrateDistance(int reading){
  int x = reading;
  float d = 51267 * pow(x,-0.976);
  return d;
}

void onEvent(AsyncWebSocket       *server,
             AsyncWebSocketClient *client,
             AwsEventType          type,
             void                 *arg,
             uint8_t              *data,
             size_t                len) {

    switch (type) {
        case WS_EVT_CONNECT:
            Serial.printf("WebSocket client #%u connected from %s\n", client->id(), client->remoteIP().toString().c_str());
            break;
        case WS_EVT_DISCONNECT:
            Serial.printf("WebSocket client #%u disconnected\n", client->id());
            break;
        case WS_EVT_DATA:
            handleWebSocketMessage(arg, data, len);
            break;
        case WS_EVT_PONG:
        case WS_EVT_ERROR:
            break;
    }
}

void onRootRequest(AsyncWebServerRequest *request) {
  request->send(SPIFFS, "/index.html", "text/html", false, processor);
}

void notifyClients() {
    //const uint8_t size = JSON_OBJECT_SIZE(1);
    //StaticJsonDocument<size> json;
    //json["status"] = onboard_led.on ? "on" : "off";

   // char buffer[17];
    //size_t len = serializeJson(json, buffer);
    
    //ws.textAll(buffer, len);
    
    ws.textAll(String(ir.reading));
    
}

String processor(const String &var) {
    return String(var == "STATE" && onboard_led.on ? "on" : "off");
}
