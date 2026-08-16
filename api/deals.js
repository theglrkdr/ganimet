```js
function parseSteamGames(html) {
  const games = [];
  const seen = new Set();

  // Steam arama sonuçlarındaki her ürün satırını yakala
  const rows = html.match(
    /<a[^>]*class="[^"]*search_result_row[^"]*"[\s\S]*?<\/a>/gi
  ) || [];

  for (const row of rows) {
    const appIdMatch = row.match(/data-ds-appid="(\d+)"/);
    const nameMatch = row.match(
      /<span class="title">([\s\S]*?)<\/span>/
    );
    const discountMatch = row.match(
      /<div class="discount_pct">-?(\d+)%<\/div>/
    );
    const oldPriceMatch = row.match(
      /<div class="discount_original_price">([\s\S]*?)<\/div>/
    );
    const finalPriceMatch = row.match(
      /<div class="discount_final_price">([\s\S]*?)<\/div>/
    );
    const imageMatch = row.match(
      /<img[^>]+src="([^"]+)"/
    );

    if (!appIdMatch || !nameMatch || !discountMatch) {
      continue;
    }

    const id = appIdMatch[1];

    if (seen.has(id)) continue;
    seen.add(id);

    const name = nameMatch[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();

    const cut = Number(discountMatch[1]);

    const cleanPrice = (value) => {
      if (!value) return 0;

      const text = value
        .replace(/<[^>]+>/g, "")
        .replace(/[^\d,.-]/g, "")
        .replace(",", ".")
        .trim();

      return Number.parseFloat(text) || 0;
    };

    const oldPrice = cleanPrice(oldPriceMatch?.[1]);
    const price = cleanPrice(finalPriceMatch?.[1]);

    // DLC / soundtrack / tool gibi oyun olmayan içerikleri
    // mümkün olduğunca temizle.
    const lowerName = name.toLowerCase();

    const excludedWords = [
      "soundtrack",
      "ost",
      "wallpaper",
      "artbook",
      "strategy guide",
      "dedicated server"
    ];

    if (
      excludedWords.some(word =>
        lowerName.includes(word)
      )
    ) {
      continue;
    }

    games.push({
      id,
      name,
      image: imageMatch?.[1] || "",
      price,
      oldPrice,
      currency: "TRY",
      cut,
      shop: "Steam",
      shopId: 61,
      url: `https://store.steampowered.com/app/${id}/`
    });
  }

  return games;
}

export default async function handler(req, res) {
  try {
    const page = Math.max(
      0,
      Number.parseInt(req.query?.page || "0", 10) || 0
    );

    // Her API çağrısında 100 Steam ürünü.
    const count = 100;
    const start = page * count;

    const steamUrl =
      `https://store.steampowered.com/search/` +
      `?specials=1` +
      `&start=${start}` +
      `&count=${count}` +
      `&cc=tr` +
      `&l=turkish`;

    const response = await fetch(steamUrl, {
      headers: {
        "User-Agent": "Ganimet/1.0"
      }
    });

    if (!response.ok) {
      throw new Error(
        `Steam HTTP ${response.status}`
      );
    }

    const html = await response.text();

    const games = parseSteamGames(html);

    return res.status(200).json({
      source: "Steam",
      page,
      count: games.length,
      nextPage: games.length === count
        ? page + 1
        : null,
      games
    });

  } catch (error) {
    console.error(
      "Steam veri hatası:",
      error
    );

    return res.status(500).json({
      error: "Steam verileri alınamadı",
      games: []
    });
  }
}
```
