#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <DHT.h>

//==============================
// KONFIGURASI WIFI
//==============================
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

//==============================
// ENDPOINT CLOUDFLARE WORKER
//==============================
const char* workerURL = "YOUR_CLOUDFLARE_WORKER_ENDPOINT";

//==============================
// PEMETAAN PIN ESP32
//==============================
#define MQ135_PIN   34
#define DHTPIN      4
#define DHTTYPE     DHT22

#define LED_HIJAU   27
#define LED_KUNING  14
#define LED_MERAH   26
#define BUZZER      25

//==============================
// INSTANSI SENSOR & AMBANG BATAS
//==============================
DHT dht(DHTPIN, DHTTYPE);
const int BATAS_AMAN = 1500;
const int BATAS_BAHAYA = 2200;

//==============================
// PENGATUR WAKTU NON-BLOCKING CLOUD
//==============================
unsigned long previousMillis = 0;
const unsigned long intervalCloud = 2000;

//==================================================
// FUNGSI KONEKSI WIFI
//==================================================
void connectWiFi() {
  Serial.print("Menghubungkan WiFi");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi Connected");
  Serial.print("IP : ");
  Serial.println(WiFi.localIP());
}

//==================================================
// FUNGSI PENGIRIMAN DATA KE CLOUDFLARE (HTTPS POST)
//==================================================
void kirimCloud(int gas, float suhu, float hum, String status){
  if(WiFi.status() != WL_CONNECTED) return;

  WiFiClientSecure client;
  client.setInsecure(); // PENTING: Bypass enkripsi SSL Cloudflare agar tidak error -1

  HTTPClient http;
  http.setTimeout(5000); // Batasi waktu tunggu agar tidak hang saat sinyal drop
  http.begin(client, workerURL);
  http.addHeader("Content-Type", "application/json");

  // Konstruksi Payload JSON + Parameter Status Kualitas Udara
  String json = "{";
  json += "\"gas\":" + String(gas) + ",";
  json += "\"suhu\":" + String(suhu, 1) + ",";
  json += "\"kelembaban\":" + String(hum, 1) + ",";
  json += "\"status\":\"" + status + "\"";
  json += "}";

  Serial.println();
  Serial.println("========== CLOUD ==========");
  Serial.println(json);

  int code = http.POST(json);

  if(code > 0){
    Serial.print("HTTP CODE: ");
    Serial.println(code);
    Serial.println(http.getString()); // Menampilkan balasan sukses dari Worker
  } else {
    Serial.print("Error Pengiriman: ");
    Serial.println(http.errorToString(code));
  }

  Serial.println("===========================");
  http.end();
}

//==================================================
// SETUP UTAMA
//==================================================
void setup() {
  Serial.begin(115200);

  // Inisialisasi Hardware
  pinMode(LED_HIJAU, OUTPUT);
  pinMode(LED_KUNING, OUTPUT);
  pinMode(LED_MERAH, OUTPUT);
  pinMode(BUZZER, OUTPUT);

  // Pastikan semua indikator mati di awal
  digitalWrite(LED_HIJAU, LOW);
  digitalWrite(LED_KUNING, LOW);
  digitalWrite(LED_MERAH, LOW);
  digitalWrite(BUZZER, LOW);

  dht.begin();
  connectWiFi();

  Serial.println();
  Serial.println("===============================");
  Serial.println(" SMART AIR MONITOR SYSTEM START");
  Serial.println("===============================");
}

//==================================================
// LOOPING PROGRAM
//==================================================
void loop() {
  // Menjaga konektivitas jaringan tetap aktif
  if(WiFi.status() != WL_CONNECTED){
    connectWiFi();
  }

  // -------------------------------------------------
  // 1. MEMBACA NILAI SENSOR
  // -------------------------------------------------
  int gas = analogRead(MQ135_PIN);
  float suhu = dht.readTemperature();
  float hum = dht.readHumidity();

  // Proteksi jika sensor dilepas / rusak
  if(isnan(suhu) || isnan(hum)){
    suhu = 0;
    hum = 0;
  }

  // Menampilkan data sensor dasar ke Serial Monitor
  Serial.print("Gas: ");
  Serial.print(gas);
  Serial.print(" | Suhu: ");
  Serial.print(suhu);
  Serial.print(" C | Kelembaban: ");
  Serial.print(hum);
  Serial.print(" %");

  // -------------------------------------------------
  // 2. LOGIKA KONDISI STATUS & INDIKATOR HARDWARE
  // -------------------------------------------------
  String status;

  if (gas < BATAS_AMAN) {
    status = "AMAN";
    digitalWrite(LED_HIJAU, HIGH);
    digitalWrite(LED_KUNING, LOW);
    digitalWrite(LED_MERAH, LOW);
    digitalWrite(BUZZER, LOW);
  }
  else if (gas < BATAS_BAHAYA) {
    status = "WASPADA";
    digitalWrite(LED_HIJAU, LOW);
    digitalWrite(LED_KUNING, HIGH);
    digitalWrite(LED_MERAH, LOW);
    digitalWrite(BUZZER, LOW);
  }
  else {
    status = "BAHAYA";
    digitalWrite(LED_HIJAU, LOW);
    digitalWrite(LED_KUNING, LOW);
    digitalWrite(LED_MERAH, HIGH);

    // Efek Bunyi Buzzer Bahaya (Beep)
    digitalWrite(BUZZER, HIGH);
    delay(350);
    digitalWrite(BUZZER, LOW);
    delay(150);
  }

  // Cetak hasil evaluasi status ke Serial Monitor
  Serial.print(" | Status: ");
  Serial.println(status);

  // -------------------------------------------------
  // 3. PENGIRIMAN DATA DATA KE CLOUD (JEDA 15 DETIK)
  // -------------------------------------------------
  if(millis() - previousMillis >= intervalCloud){
    previousMillis = millis();
    kirimCloud(gas, suhu, hum, status);
  }

  delay(1000); // Delay dasar perulangan 1 detik
}
