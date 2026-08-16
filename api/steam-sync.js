function cleanHtml(value = "") {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPrice(value = "") {
  const text = cleanHtml(value);

  if (!text) {
    return null;
  }

  // Steam fiyatını USD olarak tutuyoruz.
  // Örnek: "$19.99" -> 19.99
  const match = text.match(/([\d,.]+)/);

  if (!match) {
    return null;
  }

  const numberText = match[1]
    .replace(/,/g, "");

  const price = Number.parseFloat(numberText);

  return Number.isFinite(price) ? price : null;
}

function isExcludedProduct(name = "", url = "") {
  const text = `${name} ${url}`.toLowerCase();

  const excludedWords = [
    "soundtrack",
    "ost",
    "wallpaper",
    "artbook",
    "strategy guide",
    "dedicated server",
    "server",
    "tool",
    "software",
    "editor",
    "sdk"
  ];

  return excludedWords.some(word => text.includes(word));
}

function parseSteamGames(html) {
  const games = [];
  const seen = new Set();

  const rows =
    html.match(
      /<a[^>]*class="[^"]*search_result_row[^"]*"[\s\S]*?<\/a>/gi
    ) || [];

  for (const row of rows) {
    const appIdMatch = row.match(
      /data-ds-appid="(\d+)"/
    );

    const nameMatch = row.match(
      /<span[^>]*class="title"[^>]*>([\s\S]*?)<\/span>/i
    );

    const discountMatch = row.match(
      /<div[^>]*class="discount_pct"[^>]*>([\s\S]*?)<\/div>/i
    );

    const oldPriceMatch = row.match(
      /<div[^>]*class="discount_original_price"[^>]*>([\s\S]*?)<\/div>/i
    );

    const finalPriceMatch = row.match(
      /<div[^>]*class="discount_final_price"[^>]*>([\s\S]*?)<\/div>/i
    );

    const imageMatch = row.match(
      /<img[^>]+src="([^"]+)"/i
    );

    if (
      !appIdMatch ||
      !nameMatch ||
      !discountMatch ||
      !finalPriceMatch
    ) {
      continue;
    }

    const appId = appIdMatch[1];

    if (seen.has(appId)) {
      continue;
    }

    seen.add(appId);

    const name = cleanHtml(nameMatch[1]);

    const discountText = cleanHtml(
      discountMatch[1]
    );

    const cut =
      Number.parseInt(
        discountText.replace(/[^\d]/g, ""),
        10
      ) || 0;

    const oldPrice = extractPrice(
      oldPriceMatch?.[1] || ""
    );

    const price = extractPrice(
      finalPriceMatch?.[1] || ""
    );

    const image =
      imageMatch?.[1] || "";

    const urlMatch = row.match(
      /href="([^"]+)"/i
    );

    const url =
      urlMatch?.[1] ||
      `https://store.steampowered.com/app/${appId}/`;

    if (!name || price === null) {
      continue;
    }

    if (isExcludedProduct(name, url)) {
      continue;
    }

    games.push({
      id: `steam-${appId}`,
      appId,
      name,
      image,
      price,
      oldPrice,
      cut,
      shop: "Steam",
      shopId: 61,
      currency: "USD",
      url
    });
  }

  return games;
}

export default async function handler(req, res) {
  try {
    const pageParam =
      req.query?.page ?? "0";

    const page =
      Math.max(
        0,
        Number.parseInt(pageParam, 10) || 0
      );

    const count = 100;
    const start = page * count;

    const steamUrl =
      "https://store.steampowered.com/search/" +
      `?specials=1` +
      `&start=${start}` +
      `&count=${count}` +
      `&cc=us` +
      `&l=english`;

    console.log(
      `Steam sync: page=${page}, start=${start}`
    );

    const response = await fetch(
      steamUrl,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml"
        },
        cache: "no-store"
      }
    );

    if (!response.ok) {
      throw new Error(
        `Steam HTTP ${response.status}`
      );
    }

    const html =
      await response.text();

    const games =
      parseSteamGames(html);

    return res.status(200).json({
      source: "Steam",
      page,
      start,
      requested: count,
      count: games.length,
      nextPage:
        games.length === count
          ? page + 1
          : null,
      games
    });

  } catch (error) {
    console.error(
      "Steam sync hatası:",
      error
    );

    return res.status(500).json({
      error:
        "Steam verileri alınamadı",
      message:
        error?.message ||
        "Bilinmeyen hata",
      games: []
    });
  }
}
