import { getStore } from "@netlify/blobs";

async function fetchSteamDeals() {
  const url =
    "https://store.steampowered.com/search/?specials=1&filter=topsellers&cc=tr&l=turkish";

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    },
  });

  if (!res.ok) {
    throw new Error(`Steam HTTP ${res.status}`);
  }

  const html = await res.text();

  const games = [];

  // Steam arama sonuçlarındaki oyun satırlarını bul
  const regex =
    /<a[^>]+class="search_result_row[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

  let match;

  while ((match = regex.exec(html)) !== null && games.length < 100) {
    const url = match[1];
    const block = match[2];

    // Oyun adı
    const nameMatch = block.match(
      /<span[^>]+class="title"[^>]*>([\s\S]*?)<\/span>/
    );

    if (!nameMatch) continue;

    const name = cleanHtml(nameMatch[1]);

    // İndirim yüzdesi
    const discountMatch = block.match(
      /<div[^>]+class="discount_pct"[^>]*>([\s\S]*?)<\/div>/
    );

    // Normal fiyat
    const originalPriceMatch = block.match(
      /<div[^>]+class="discount_original_price"[^>]*>([\s\S]*?)<\/div>/
    );

    // İndirimli fiyat
    const finalPriceMatch = block.match(
      /<div[^>]+class="discount_final_price"[^>]*>([\s\S]*?)<\/div>/
    );

    // Resim
    const imageMatch = block.match(
      /<img[^>]+src="([^"]+)"/
    );

    const discount = discountMatch
      ? parseInt(cleanHtml(discountMatch[1]).replace("-", ""), 10)
      : 0;

    const oldPrice = originalPriceMatch
      ? cleanHtml(originalPriceMatch[1])
      : "";

    const price = finalPriceMatch
      ? cleanHtml(finalPriceMatch[1])
      : "";

    const image = imageMatch ? imageMatch[1] : "";

    games.push({
      id: `steam-${games.length}-${encodeURIComponent(name)}`,
      name,
      image,
      price,
      oldPrice,
      cut: discount,
      shop: "Steam",
      shopId: 61,
      currency: "TRY",
      url,
    });
  }

  return games;
}

function cleanHtml(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export default async () => {
  try {
    console.log("Ganimet: Steam indirimleri çekiliyor...");

    const games = await fetchSteamDeals();

    const store = getStore("ganimet-deals");

    await store.setJSON("latest", {
      updatedAt: new Date().toISOString(),
      source: "Steam",
      games,
    });

    console.log(
      `Ganimet: ${games.length} Steam indirimi kaydedildi`
    );
  } catch (err) {
    console.error(
      "Ganimet Steam veri çekme hatası:",
      err
    );

    throw err;
  }
};

export const config = {
  schedule: "0 */6 * * *",
};
