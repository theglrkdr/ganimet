function decodeHtml(text = "") {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function cleanText(text = "") {
  return decodeHtml(
    text.replace(/<[^>]*>/g, "")
  ).trim();
}

function cleanPrice(text = "") {
  if (!text) return 0;

  let value = cleanText(text)
    .replace(/[^\d,.-]/g, "")
    .trim();

  if (!value) return 0;

  if (value.includes(",") && value.includes(".")) {
    value = value
      .replace(/\./g, "")
      .replace(",", ".");
  } else if (value.includes(",")) {
    value = value.replace(",", ".");
  }

  const number = Number.parseFloat(value);

  return Number.isFinite(number) ? number : 0;
}

function extractImage(row) {
  const patterns = [
    /data-src="([^"]+)"/i,
    /src="([^"]+)"/i
  ];

  for (const pattern of patterns) {
    const match = row.match(pattern);

    if (match?.[1]) {
      return match[1];
    }
  }

  return "";
}

function parseSteamGames(html) {
  const games = [];
  const seen = new Set();

  const rows =
    html.match(
      /<a[^>]*class="[^"]*search_result_row[^"]*"[\s\S]*?<\/a>/gi
    ) || [];

  for (const row of rows) {
    const appIdMatch =
      row.match(/data-ds-appid="([^"]+)"/i);

    const nameMatch =
      row.match(
        /<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/i
      );

    const discountMatch =
      row.match(
        /<div[^>]*class="[^"]*discount_pct[^"]*"[^>]*>[\s\S]*?-?(\d+)%[\s\S]*?<\/div>/i
      );

    if (!appIdMatch || !nameMatch || !discountMatch) {
      continue;
    }

    const id = appIdMatch[1]
      .split(",")[0]
      .trim();

    if (!/^\d+$/.test(id)) continue;
    if (seen.has(id)) continue;

    const name = cleanText(nameMatch[1]);

    if (!name) continue;

    const cut =
      Number.parseInt(
        discountMatch[1],
        10
      ) || 0;

    if (cut <= 0) continue;

    const oldPriceMatch =
      row.match(
        /<div[^>]*class="[^"]*discount_original_price[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      );

    const finalPriceMatch =
      row.match(
        /<div[^>]*class="[^"]*discount_final_price[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      );

    const oldPrice =
      cleanPrice(oldPriceMatch?.[1]);

    const price =
      cleanPrice(finalPriceMatch?.[1]);

    if (price <= 0) continue;

    const lowerName =
      name.toLowerCase();

    const excludedWords = [
      "soundtrack",
      "original soundtrack",
      "ost",
      "wallpaper",
      "artbook",
      "art book",
      "strategy guide",
      "digital artbook",
      "dedicated server"
    ];

    if (
      excludedWords.some(word =>
        lowerName.includes(word)
      )
    ) {
      continue;
    }

    seen.add(id);

    games.push({
      id,
      name,
      image: extractImage(row),

      // Steam'in gerçek fiyatı USD
      price,
      oldPrice,
      currency: "USD",

      cut,

      shop: "Steam",
      shopId: 61,

      url:
        `https://store.steampowered.com/app/${id}/`
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
      "https://store.steampowered.com/search/" +
      "?specials=1" +
      "&category1=998" +
      `&start=${start}` +
      `&count=${count}` +
      "&cc=tr" +
      "&l=turkish";

    const steamResponse =
      await fetch(steamUrl, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0 Safari/537.36",

          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

          "Accept-Language":
            "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",

          "Referer":
            "https://store.steampowered.com/"
        }
      });

    if (!steamResponse.ok) {
      throw new Error(
        `Steam HTTP ${steamResponse.status}`
      );
    }

    const html =
      await steamResponse.text();

    if (!html || html.length < 1000) {
      throw new Error(
        "Steam boş veya geçersiz cevap verdi"
      );
    }

    const games =
      parseSteamGames(html);

    if (games.length === 0) {
      throw new Error(
        "Steam'den indirimli oyun bulunamadı"
      );
    }

    // Güncel USD → TRY kuru
    let usdToTry = null;

    try {
      const fxResponse =
        await fetch(
          "https://api.frankfurter.app/latest?from=USD&to=TRY"
        );

      if (fxResponse.ok) {
        const fxData =
          await fxResponse.json();

        usdToTry =
          Number(fxData?.rates?.TRY) || null;
      }
    } catch (fxError) {
      console.error(
        "Kur alınamadı:",
        fxError
      );
    }

    // TL karşılığını hesapla
    const finalGames =
      games.map(game => ({
        ...game,

        usdToTry,

        priceTry:
          usdToTry
            ? Number(
                (game.price * usdToTry)
                  .toFixed(2)
              )
            : null,

        oldPriceTry:
          usdToTry
            ? Number(
                (game.oldPrice * usdToTry)
                  .toFixed(2)
              )
            : null
      }));

    return res.status(200).json({
      source: "Steam",

      currency: "USD",

      usdToTry,

      page,

      count:
        finalGames.length,

      nextPage:
        finalGames.length >= count
          ? page + 1
          : null,

      updatedAt:
        new Date().toISOString(),

      games: finalGames
    });

  } catch (error) {
    console.error(
      "Steam API hatası:",
      error?.stack || error
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
