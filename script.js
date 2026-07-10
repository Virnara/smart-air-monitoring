const API = "https://smart-air-monitor.radel-vrdna.workers.dev/";

// DOM Binding Elements
const gasText = document.getElementById("gas");
const suhuText = document.getElementById("suhu");
const humText = document.getElementById("hum");
const statusText = document.getElementById("status");
const statusIcon = document.getElementById("status-icon");
const gasIcon = document.getElementById("gas-icon");
const timeText = document.getElementById("time");
const liveClock = document.getElementById("live-clock");
const cardGas = document.getElementById("card-gas");
const espStatus = document.getElementById("esp-status");
const cfStatus = document.getElementById("cf-status");

// Penambahan Komponen Baru V2
const loadingScreen = document.getElementById("loading-screen");
const gaugeFill = document.getElementById("gauge-fill");
const gaugeVal = document.getElementById("gauge-val");
const uptimeClock = document.getElementById("uptime-clock");
const wifiStatus = document.getElementById("wifi-status");
const statMaxText = document.getElementById("stat-max");
const statMinText = document.getElementById("stat-min");
const statAvgText = document.getElementById("stat-avg");

let currentStatus = "loading";
let lastSuccessTime = Date.now();
const startTime = Date.now();

// Array Penyimpan Nilai untuk Kebutuhan Mini Statistik
let gasHistoryArray = [];

// 🔋 Real-Time Dashboard Uptime & System Watchdog
function updateSystemMetrics() {
    // 1. Live Clock & Date
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    liveClock.innerHTML = `<i class="fa-regular fa-clock"></i> ${now.toLocaleDateString('id-ID', options)} — ${now.toLocaleTimeString('id-ID')}`;

    // 2. Uptime Counter
    const diffSecs = Math.floor((Date.now() - startTime) / 1000);
    const hrs = String(Math.floor(diffSecs / 3600)).padStart(2, '0');
    const mins = String(Math.floor((diffSecs % 3600) / 60)).padStart(2, '0');
    const secs = String(diffSecs % 60).padStart(2, '0');
    uptimeClock.innerText = `${hrs}:${mins}:${secs}`;

    // 3. Watchdog Detektor Data Macet (35 Detik Batas Toleransi, karena ESP kirim tiap 15 detik)
    if (Date.now() - lastSuccessTime > 35000 && currentStatus !== "loading") {
        espStatus.innerHTML = "❌ Offline (No Signal)";
        espStatus.className = "offline";
        wifiStatus.innerHTML = "Disconnected";
        wifiStatus.className = "offline";
        resetDisplayData();
    }
}
setInterval(updateSystemMetrics, 1000);

// Jika putus jaringan / gagal fetch, reset teks sensor ke "--" sesuai saranmu
function resetDisplayData() {
    gasText.innerHTML = "--";
    suhuText.innerHTML = "--°C";
    humText.innerHTML = "--%";
    gaugeVal.innerText = "--";
    gaugeFill.style.transform = "rotate(0deg)";
}

if (Notification.permission === "default") { Notification.requestPermission(); }

function showToast(message, type) {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast`;
    let icon = '<i class="fa-solid fa-bell"></i>';
    if (type === 'danger') { toast.style.borderLeft = "5px solid #ef4444"; icon = '<i class="fa-solid fa-radiation fa-bounce" style="color:#ef4444"></i>'; }
    if (type === 'warning') { toast.style.borderLeft = "5px solid #fbbf24"; icon = '<i class="fa-solid fa-triangle-exclamation" style="color:#fbbf24"></i>'; }
    if (type === 'success') { toast.style.borderLeft = "5px solid #34d399"; icon = '<i class="fa-solid fa-circle-check" style="color:#34d399"></i>'; }
    toast.innerHTML = `${icon} <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add("show"), 100);
    setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function triggerSystemNotification(title, body) {
    if (Notification.permission === "granted") {
        new Notification(title, { body: body, icon: 'https://cdn-icons-png.flaticon.com/512/1821/1821817.png' });
    }
}

// Chart.js Setup dengan Binding Data & Animasi 700ms Mulus
const labels = [];
const gasData = [];
const ctx = document.getElementById("gasChart").getContext("2d");
const gradient = ctx.createLinearGradient(0, 0, 0, 300);
gradient.addColorStop(0, 'rgba(56, 189, 248, 0.3)');
gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

const chart = new Chart(ctx, {
    type: "line",
    data: {
        labels: labels,
        datasets: [{
            label: "Level Gas (ADC)",
            data: gasData,
            borderColor: "#38bdf8",
            borderWidth: 2.5,
            pointBackgroundColor: "#0284c7",
            fill: true,
            backgroundColor: gradient,
            tension: 0.3
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
            duration: 700,
            easing: 'easeOutQuart'
        },
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.02)' }, ticks: { color: "#475569" } },
            y: { grid: { color: 'rgba(255,255,255,0.02)' }, ticks: { color: "#475569" } }
        }
    }
});

// Tambahkan fungsi pembantu untuk memicu efek pop-up teks membesar
function triggerPopEffect(element) {
    element.classList.remove("value-pop");
    void element.offsetWidth; // Mengatur ulang siklus animasi DOM (Triggers Reflow)
    element.classList.add("value-pop");
}

// Fungsi Pengolah Mini Statistik (MAX, MIN, AVG) yang sempat terpotong
function calculateStatistics(currentGas) {
    gasHistoryArray.push(currentGas);
    const max = Math.max(...gasHistoryArray);
    const min = Math.min(...gasHistoryArray);
    const sum = gasHistoryArray.reduce((acc, val) => acc + val, 0);
    const avg = Math.round(sum / gasHistoryArray.length);

    statMaxText.innerText = max;
    statMinText.innerText = min;
    statAvgText.innerText = avg;
}

// Core Engine Fetcher IoT Data
async function loadData() {
    try {
        const res = await fetch(API);
        if (!res.ok) throw new Error("Worker Error");
        const data = await res.json();

        const gas = parseInt(data.gas) || 0;
        const suhu = parseFloat(data.suhu) || 0;
        const hum = parseFloat(data.kelembaban) || 0;

        lastSuccessTime = Date.now();

        if (loadingScreen.style.opacity !== "0") {
            loadingScreen.style.opacity = "0";
            setTimeout(() => loadingScreen.style.visibility = "hidden", 500);
        }

        // 📊 Tampilkan data ke Antarmuka + Jalankan Efek Zoom jika data berubah
        if (gasText.innerText != gas) { gasText.innerHTML = gas; triggerPopEffect(gasText); }
        if (suhuText.innerText != suhu + "°C") { suhuText.innerHTML = suhu + "°C"; triggerPopEffect(suhuText); }
        if (humText.innerText != hum + "%") { humText.innerHTML = hum + "%"; triggerPopEffect(humText); }

        // 🌫️ Gauge Meter Animasi Membal
        gaugeVal.innerText = gas;
        const angle = (Math.min(gas, 5000) / 5000) * 180;
        gaugeFill.style.transform = `rotate(${angle}deg)`;

        // Hitung statistik sesi berjalan
        calculateStatistics(gas);

        // 🚀 Penerapan Threshold Baru Sesuai Pola Riil Sensor Kamu
        if (gas < 3000) {
            // Kondisi 🟢 AMAN
            statusText.className = "status aman";
            statusText.querySelector('span').innerText = "AMAN";
            statusIcon.className = "fa-solid fa-circle-check";

            // Fix Bug Spasi Ikon fa-fade
            gasIcon.className = "fa-solid fa-smog";
            cardGas.className = "card card-status-aman";

            // 🌈 Ubah warna tema ambient latar belakang
            document.body.className = "theme-aman";

            if (currentStatus !== "aman") {
                showToast("Kualitas udara kembali normal & aman.", "success");
                currentStatus = "aman";
            }
        } else if (gas < 3600) {
            // Kondisi 🟡 WASPADA
            statusText.className = "status waspada";
            statusText.querySelector('span').innerText = "WASPADA";
            statusIcon.className = "fa-solid fa-triangle-exclamation";

            gasIcon.className = "fa-solid fa-triangle-exclamation fa-fade";
            cardGas.className = "card card-status-waspada";

            document.body.className = "theme-waspada";

            if (currentStatus !== "waspada") {
                showToast("Peringatan: Polusi gas meningkat (Waspada)!", "warning");
                triggerSystemNotification("Smart Air Alert", "Status udara saat ini WASPADA.");
                currentStatus = "waspada";
            }
        } else {
            // Kondisi 🔴 BAHAYA
            statusText.className = "status bahaya";
            statusText.querySelector('span').innerText = "BAHAYA";
            statusIcon.className = "fa-solid fa-biohazard fa-spin";

            gasIcon.className = "fa-solid fa-radiation fa-fade";
            cardGas.className = "card card-status-bahaya";

            document.body.className = "theme-bahaya";

            if (currentStatus !== "bahaya") {
                showToast("⚠️ BAHAYA! Kebocoran Asap Pekat Terdeteksi!", "danger");
                triggerSystemNotification("🚨 EMERGENSI UDARA", "Kondisi BAHAYA! Deteksi gas melebihi ambang batas!");
                currentStatus = "bahaya";
            }
        }

        // Status Infrastruktur & Kekuatan Sinyal Wifi Dinamis berdasarkan Uptime
        cfStatus.innerHTML = "🟢 Connected";
        cfStatus.className = "online";
        espStatus.innerHTML = "🟢 Online";
        espStatus.className = "online";
        wifiStatus.innerHTML = gas > 4000 ? "⚠️ High Noise" : "█████ Excellent";
        wifiStatus.className = "online";

        const now = new Date();
        const timeString = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        timeText.innerHTML = timeString;

        // Manajemen Poin Grafik (Ditingkatkan ke 40 Poin)
        labels.push(timeString);
        gasData.push(gas);
        if (labels.length > 40) {
            labels.shift();
            gasData.shift();
        }
        chart.update();

    } catch (err) {
        console.error("Gagal menarik data IoT:", err);
        cfStatus.innerHTML = "🔴 Disconnected";
        cfStatus.className = "offline";
        resetDisplayData();
    }
}

// Jalankan inisialisasi awal
loadData();

// ⏰ Penggantian Interval Pengambilan Data ke 15 Detik (Sesuai frekuensi pengiriman data ESP32)
setInterval(loadData, 15000);