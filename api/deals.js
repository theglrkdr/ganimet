export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://store.steampowered.com/api/featuredcategories/",
      {
        headers: {
          "User-Agent": "Ganimet/1.0"
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Steam HTTP ${response.status}`);
    }

    const data = await response.json();

    const categories = [
      data.specials,
      data.top_sellers,
      data.new_releases
    ];

    const games = [];
    const seen = new Set();

    for (const category of categories) {
      if (!category?.items) continue;

      for (const item of category.items) {
        const id = String(item.id);

        if (seen.has(id)) continue;
        seen.add(id);

        const discount = Number(item.discount_percent || 0);

        // Sadece gerçekten indirimde olanları al
        if (discount <= 0) continue;

        games.push({
          id,
          name: item.name || "Bilinmeyen oyun",

          image:
            item.large_capsule_image ||
            item.small_capsule_image ||
            "",

          price:
            item.final_price != null
              ? Number(item.final_price) / 100
              : 0,

          oldPrice:
            item.original_price != null
              ? Number(item.original_price) / 100
              : 0,

          currency: "TRY",

          cut: discount,

          shop: "Steam",
          shopId: 61,

          url:
            `https://store.steampowered.com/app/${item.id}/`
        });
      }
    }

    // En yüksek indirimler üstte
    games.sort((a, b) => b.cut - a.cut);

    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      source: "Steam",
      games
    });

  } catch (error) {

    console.error("Steam veri hatası:", error);

    return res.status(500).json({
      error: "Steam verileri alınamadı",
      games: []
    });
  }
}
