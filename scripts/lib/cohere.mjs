// Helper embed Cohere untuk skrip Node (nightly_sync, migrate_material_photos). API key
// dioper sebagai argumen supaya tiap skrip bebas menentukan sumbernya (process.env, atau
// fallback .env seperti di migrate). Edge functions Deno (supabase/functions/) & App.jsx
// (browser, import.meta.env) sengaja TIDAK pakai ini — runtime & cara deploy beda.

const ENDPOINT = "https://api.cohere.com/v1/embed";
const MODEL = "embed-multilingual-v3.0";

async function embed(body, apiKey) {
  const resp = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (!resp.ok) {
    const err = new Error(`Cohere embed gagal (${resp.status}): ${await resp.text()}`);
    err.status = resp.status; // biar pemanggil bisa retry mis. saat 429 (rate limit)
    throw err;
  }
  return (await resp.json()).embeddings;
}

// Teks → array vektor (sejajar urutan `texts`).
export function cohereEmbed(texts, inputType, apiKey) {
  return embed({ texts, input_type: inputType }, apiKey);
}

// 1 gambar (data-URL base64) → 1 vektor.
export async function cohereEmbedImage(dataUri, apiKey) {
  const embeddings = await embed({ input_type: "image", images: [dataUri] }, apiKey);
  const v = embeddings?.[0] || embeddings?.float?.[0];
  if (!v) throw new Error("Cohere tidak mengembalikan embedding gambar");
  return v;
}
