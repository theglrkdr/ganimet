export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://store.steampowered.com/api/featuredcategories/"
    );

    if (!response.ok) {
      throw new Error("Steam verisi alınamadı");
    }

    const data = await response.json();

    const games = [];

    const categories = [
      data.specials,
      data.top_sellers,
      data.new_releases,
      data.coming_soon
    ];

    for (const category of categories) {
      if (!category || !category.items) continue;

      for (const item of category.items) {
        games.push({
          id: item.id,
          name: item.name,
          image: item.large_capsule_image || item.small_capsule_image || "",
          price: item.final_price
            ? (item.final_price / 100).toFixed(2)
            : null,
          currency: "TRY",
          oldPrice: item.original_price
            ? (item.original_price / 100).toFixed(2)
            : null,
          cut: item.discount_percent || 0,
          shop: "Steam",
          shopId: 61,
          url: `https://store.steampowered.com/app/${item.id}/`
        });
      }
    }

    res.status(200).json({
      updatedAt: new Date().toISOString(),
      games
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Oyun verileri alınamadı",
      games: []
    });
  }
}
