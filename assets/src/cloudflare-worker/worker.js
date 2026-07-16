export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Bypass CORS agar frontend index.html bisa membaca data dari domain luar
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. ENDPOINT POST: MENERIMA DATA DARI NODE ESP32
    if (request.method === "POST" && url.pathname === "/kirim-data") {
      try {
        const data = await request.json(); 
        
        // Simpan data ke tabel D1 yang sudah disiapkan
        await env.DB.prepare(
          "INSERT INTO data_smart (gas, suhu, kelembaban) VALUES (?, ?, ?)"
        ).bind(data.gas, data.suhu, data.kelembaban).run();

        return new Response("Data sukses disimpan!", { status: 200, headers: corsHeaders });
      } catch (err) {
        return new Response("Gagal simpan: " + err.message, { status: 500, headers: corsHeaders });
      }
    }

    // 2. ENDPOINT GET: SUPLEMEN DATA UNTUK SCRIPT.JS DASHBOARD RADEL
    if (request.method === "GET") {
      try {
        // Mengambil 1 data paling terbaru di database
        const dataTerbaru = await env.DB.prepare(
          "SELECT * FROM data_sensor ORDER BY waktu DESC LIMIT 1"
        ).first();

        if (!dataTerbaru) {
          // Data dummy pengaman jika DB Anda masih kosong melompong agar script.js tidak error
          return new Response(JSON.stringify({ gas: 1200, suhu: 27.5, kelembaban: 65.0 }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        return new Response(JSON.stringify(dataTerbaru), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
    }
  },
};
