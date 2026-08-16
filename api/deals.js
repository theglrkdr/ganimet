function decodeHtml(text = "") {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function parseSteamGames(html) {
  const games = [];
  const seen = new Set();

  const rows =
    html.match(
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

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);

    const name = decodeHtml(nameMatch[1]);

    const cut = Number(discountMatch[1]);

    function cleanPrice(value) {
      if (!value) {
        return 0;
      }

      const text = decodeHtml(value)
        .replace(/[^\d,.-]/g, "")
        .replace(",", ".")
        .trim();

      return Number.parseFloat(text) || 0;
    }

    const oldPrice = cleanPrice(oldPriceMatch?.[1]);
    const price = cleanPrice(finalPriceMatch?.[1]);

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
      excludedWords.some((word) =>
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
    const page =
      Math.max(
        0,
        Number.parseInt(
          req.query?.page || "0",
          10
        ) || 0
      );

    const count = 100;
    const start = page * count;

    const steamUrl =
      "https://store.steampowered.com/search/results/" +
      "?specials=1" +
      "&json=1" +
      `&start=${start}` +
      `&count=${count}` +
      "&cc=tr" +
      "&l=turkish" +
      "&category1=998";

    console.log(
      "Steam istek:",
      steamUrl
    );

    const response = await fetch(steamUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0 Safari/537.36",
        "Accept":
          "application/json,text/javascript,*/*;q=0.01",
        "Accept-Language":
          "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer":
          "https://store.steampowered.com/"
      }
    });

    console.log(
      "Steam HTTP:",
      response.status
    );

    if (!response.ok) {
      throw new Error(
        `Steam HTTP ${response.status}`
      );
    }

    const data = await response.json();

    const html =
      data.results_html ||
      data.resultsHtml ||
      "";

    if (!html) {
      console.error(
        "Steam cevabı:",
        JSON.stringify(data).slice(0, 2000)
      );

      throw new Error(
        "Steam sonuç HTML'i bulunamadı"
      );
    }

    const games = parseSteamGames(html);

    return res.status(200).json({
      source: "Steam",
      page,
      count: games.length,
      nextPage:
        games.length === count
          ? page + 1
          : null,
      games
    });

  } catch (error) {
    console.error(
      "Steam veri hatası:",
      error?.stack || error
    );

    return res.status(500).json({
      error: "Steam verileri alınamadı",
      message: error?.message || "Bilinmeyen hata",
      games: []
    });
  }
}
