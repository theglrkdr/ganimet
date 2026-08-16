```js
const STEAM_SEARCH_URL =
  "https://store.steampowered.com/search/results/";

const EXCHANGE_URL =
  "https://api.frankfurter.app/latest?from=USD&to=TRY";

function decodeHtml(text = "") {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function cleanText(text = "") {
  return decodeHtml(
    text.replace(/<[^>]+>/g, "")
  );
}

function parsePrice(text = "") {
  const cleaned = cleanText(text)
    .replace(/[^\d.,-]/g, "")
    .replace(",", ".");

  return Number.parseFloat(cleaned) || 0;
}

function parseSteamGames(html) {
  const games = [];
  const seen = new Set();

  /*
   * Steam'in search/results endpoint'i
   * JSON içinde HTML döndürüyor.
   */
  let data;

  try {
    data = JSON.parse(html);
  } catch {
    return [];
  }

  const resultsHtml =
    data.results_html || "";

  const rows =
    resultsHtml.match(
      /<a[^>]*class="[^"]*search_result_row[^"]*"[\s\S]*?<\/a>/gi
    ) || [];

  for (const row of rows) {
    const appIdMatch =
      row.match(/data-ds-appid="(\d+)"/);

    const nameMatch =
      row.match(
        /<span class="title">([\s\S]*?)<\/span>/
      );

    const discountMatch =
      row.match(
        /<div class="discount_pct">-?(\d+)%<\/div>/
      );

    const oldPriceMatch =
      row.match(
        /<div class="discount_original_price">([\s\S]*?)<\/div>/
      );

    const finalPriceMatch =
      row.match(
        /<div class="discount_final_price">([\s\S]*?)<\/div>/
      );

    const imageMatch =
      row.match(
        /<img[^>]+src="([^"]+)"/
      );

    if (
      !appIdMatch ||
      !nameMatch ||
      !discountMatch ||
      !finalPriceMatch
    ) {
      continue;
    }

    const id = appIdMatch[1];

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);

    const name =
      cleanText(nameMatch[1]);

    const cut =
      Number(discountMatch[1]);

    const oldPrice =
      parsePrice(oldPriceMatch?.[1]);

    const price =
      parsePrice(finalPriceMatch?.[1]);

    if (!price || !cut) {
      continue;
    }

    const lowerName =
      name.toLowerCase();

    /*
     * Oyun olmayan bazı Steam içeriklerini
     * mümkün olduğunca çıkarıyoruz.
     */
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

      image:
        imageMatch?.[1] || "",

      /*
       * Steam'den gelen gerçek fiyat.
       */
      priceUSD: price,
      oldPriceUSD: oldPrice,

      currency: "USD",

      /*
       * Site üzerinde kullanılacak.
       */
      cut,

      shop: "Steam",
      shopId: 61,

      url:
        `https://store.steampowered.com/app/${id}/`
    });
  }

  return games;
}

async function getExchangeRate() {
  const response =
    await fetch(EXCHANGE_URL, {
      headers: {
        "User-Agent": "Ganimet/1.0"
      }
    });

  if (!response.ok) {
    throw new Error(
      `Kur servisi HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  const rate =
    Number(data?.rates?.TRY);

  if (!rate || !Number.isFinite(rate)) {
    throw new Error(
      "USD/TRY kuru alınamadı"
    );
  }

  return rate;
}

export default async function handler(req, res) {
  try {
    const page = Math.max(
      0,
      Number.parseInt(
        req.query?.page || "0",
        10
      ) || 0
    );

    /*
     * Her istekte 100 Steam ürünü.
     */
    const count = 100;

    const start =
      page * count;

    /*
     * Steam ABD/USD fiyatlarını çekiyoruz.
     *
     * cc=us:
     * Steam fiyatını USD olarak ister.
     */
    const steamUrl =
      `${STEAM_SEARCH_URL}` +
      `?specials=1` +
      `&start=${start}` +
      `&count=${count}` +
      `&cc=us` +
      `&l=english` +
      `&infinite=1`;

    const [
      steamResponse,
      exchangeRate
    ] = await Promise.all([
      fetch(steamUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0 Safari/537.36",
          "Accept":
            "application/json,text/javascript,*/*;q=0.01",
          "Accept-Language":
            "en-US,en;q=0.9"
        }
      }),

      getExchangeRate()
    ]);

    if (!steamResponse.ok) {
      throw new Error(
        `Steam HTTP ${steamResponse.status}`
      );
    }

    const steamHtml =
      await steamResponse.text();

    if (!steamHtml) {
      throw new Error(
        "Steam boş cevap verdi"
      );
    }

    const steamGames =
      parseSteamGames(steamHtml);

    /*
     * Steam USD → güncel TRY
     *
     * Vergi, ekstra ücret veya
     * kafadan ekleme YOK.
     */
    const games =
      steamGames.map(game => ({
        ...game,

        priceTRY:
          Number(
            (
              game.priceUSD *
              exchangeRate
            ).toFixed(2)
          ),

        oldPriceTRY:
          Number(
            (
              game.oldPriceUSD *
              exchangeRate
            ).toFixed(2)
          )
      }));

    return res.status(200).json({
      source: "Steam",

      currency: "USD",

      /*
       * O an kullanılan güncel kur.
       */
      exchangeRate: {
        from: "USD",
        to: "TRY",
        value: exchangeRate
      },

      page,

      count: games.length,

      nextPage:
        games.length === count
          ? page + 1
          : null,

      updatedAt:
        new Date().toISOString(),

      games
    });

  } catch (error) {
    console.error(
      "Steam veri hatası:",
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
```

