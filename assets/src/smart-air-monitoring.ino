#include <WiFi.h>
#include <HTTPClient.h>
#include "DHT.h"

//======================
// KONFIGURASI WIFI
//======================
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

//======================
// CLOUDFLARE WORKER
//======================
const char* cloudflare_url = "YOUR_CLOUDFLARE_WORKER_ENDPOINT";

//======================
// PIN SENSOR & AKTUATOR
//======================
#define DHTPIN 4
#define DHTTYPE DHT22
#define MQ135_PIN 34
#define LED_MERAH 26
#define LED_HIJAU 27
#define BUZZER 25

DHT dht(DHTPIN, DHTTYPE);

//======================
// BATAS GAS & STATE
//======================
const int batasBahaya = 3000;
bool statusBahayaSebelumnya = false; // Untuk melacak perubahan status

//======================
// TIMER (NON-BLOCKING)
//======================
unsigned long previousMillisCloud = 0;
const unsigned long intervalCloud = 15000; // Kirim normal tiap 15 detik

unsigned long previousMillisBuzzer = 0;
bool buzzerState = false;

//====================================================

void setup() {
  Serial.begin(115200);

  pinMode(LED_MERAH, OUTPUT);
  pinMode(LED_HIJAU, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  digitalWrite(LED_MERAH, LOW);
  digitalWrite(LED_HIJAU, HIGH);
  digitalWrite(BUZZER, LOW);

  dht.begin();

  Serial.println("\n==============================");
  Serial.println("SMART AIR MONITOR START");
  Serial.println("==============================");

  // Set WiFi agar auto-reconnect jika router mati lalu nyala lagi
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  
  Serial.print("Menghubungkan WiFi");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Berhasil Terhubung!");
  Serial.print("IP Address : ");
  Serial.println(WiFi.localIP());
}

void loop() {
  unsigned long currentMillis = millis();

  //======================
  // 1. BACA SENSOR
  //======================
  int nilaiGas = analogRead(MQ135_PIN);
  float suhu = dht.readTemperature();
  float kelembaban = dht.readHumidity();

  if (isnan(suhu) || isnan(kelembaban)) {
    Serial.println("Gagal membaca DHT22, menggunakan nilai 0");
    suhu = 0.0;
    kelembaban = 0.0;
  }

  bool isBahaya = (nilaiGas >= batasBahaya);

  //======================
  // 2. LED & BUZZER (NON-BLOCKING)
  //======================
  if (isBahaya) {
    digitalWrite(LED_HIJAU, LOW);
    digitalWrite(LED_MERAH, HIGH);

    // Buzzer berkedip tanpa menggunakan delay()
    if (currentMillis - previousMillisBuzzer >= 200) {
      previousMillisBuzzer = currentMillis;
      buzzerState = !buzzerState;
      digitalWrite(BUZZER, buzzerState);
    }
  } else {
    digitalWrite(LED_HIJAU, HIGH);
    digitalWrite(LED_MERAH, LOW);
    digitalWrite(BUZZER, LOW);
    buzzerState = false;
  }

  //======================
  // 3. LOGIKA KIRIM KE CLOUD
  //======================
  
  // Trigger darurat: Jika detik ini berubah dari Aman ke Bahaya, LANGSUNG kirim!
  bool triggerDarurat = (isBahaya && !statusBahayaSebelumnya);
  statusBahayaSebelumnya = isBahaya;

  // Kirim data jika sudah 15 detik ATAU ada bahaya mendadak
  if ((currentMillis - previousMillisCloud >= intervalCloud) || triggerDarurat) {
    previousMillisCloud = currentMillis;

    // Cetak ke Serial Monitor (Hanya saat akan kirim data agar terminal bersih)
    Serial.printf("Gas: %d | Suhu: %.1f C | Kelembaban: %.1f %%\n", nilaiGas, suhu, kelembaban);

    if (WiFi.status() == WL_CONNECTED) {
      HTTPClient http;
      http.begin(cloudflare_url);
      http.addHeader("Content-Type", "application/json");

      // Menggunakan snprintf (C-String) untuk menghindari Memory Leak
      char jsonPayload[128];
      snprintf(jsonPayload, sizeof(jsonPayload), "{\"gas\":\"%d\",\"suhu\":\"%.1f\",\"kelembaban\":\"%.1f\"}", nilaiGas, suhu, kelembaban);

      Serial.println("-> Mengirim Data ke Cloudflare...");
      
      int responseCode = http.POST(jsonPayload);

      if (responseCode > 0) {
        Serial.printf("   HTTP Response : %d\n", responseCode);
      } else {
        Serial.printf("   Error : %s\n", http.errorToString(responseCode).c_str());
      }
      http.end();
      
    } else {
      Serial.println("WiFi Terputus! Menunggu auto-reconnect...");
    }
  }
}
