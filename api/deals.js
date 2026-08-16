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

  /*
    Steam Türkiye fiyatları bazen:

    1.039,00
    39,99
    999,00

    şeklinde gelir.

    Nokta binlik ayırıcı,
    virgül ondalık ayırıcı olarak kabul edilir.
  */

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

function extractFirstImage(row) {
  const patterns = [
    /data-src="([^"]+)"/i,
    /src="([^"]+)"/i,
    /data-capsule-micro="([^"]+)"/i
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

  /*
    Steam arama sayfasındaki ürün satırları.
  */

  const rows =
    html.match(
      /<a[^>]*class="[^"]*search_result_row[^"]*"[\s\S]*?<\/a>/gi
    ) || [];

  for (const row of rows) {
    /*
      APP ID
    */

    const appIdMatch =
      row.match(/data-ds-appid="([^"]+)"/i);

    if (!appIdMatch) {
      continue;
    }

    /*
      Bazı Steam sonuçlarında data-ds-appid
      birden fazla ID içerebilir.

      İlk ID'yi kullanıyoruz.
    */

    const id = appIdMatch[1]
      .split(",")[0]
      .trim();

    if (!/^\d+$/.test(id)) {
      continue;
    }

    if (seen.has(id)) {
      continue;
    }

    /*
      OYUN ADI
    */

    const nameMatch =
      row.match(
        /<span[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/span>/i
      );

    if (!nameMatch) {
      continue;
    }

    const name = cleanText(nameMatch[1]);

    if (!name) {
      continue;
    }

    /*
      İNDİRİM
    */

    const discountMatch =
      row.match(
        /<div[^>]*class="[^"]*discount_pct[^"]*"[^>]*>[\s\S]*?-?(\d+)%[\s\S]*?<\/div>/i
      );

    if (!discountMatch) {
      continue;
    }

    const cut =
      Number.parseInt(
        discountMatch[1],
        10
      ) || 0;

    /*
      SADECE GERÇEK İNDİRİMLER
    */

    if (cut <= 0) {
      continue;
    }

    /*
      ESKİ FİYAT
    */

    const oldPriceMatch =
      row.match(
        /<div[^>]*class="[^"]*discount_original_price[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      );

    /*
      YENİ FİYAT
    */

    const finalPriceMatch =
      row.match(
        /<div[^>]*class="[^"]*discount_final_price[^"]*"[^>]*>([\s\S]*?)<\/div>/i
      );

    const oldPrice =
      cleanPrice(
        oldPriceMatch?.[1] || ""
      );

    const price =
      cleanPrice(
        finalPriceMatch?.[1] || ""
      );

    /*
      Fiyat yoksa ürünü alma.
    */

    if (price <= 0) {
      continue;
    }

    /*
      GÖRSEL
    */

    const image =
      extractFirstImage(row);

    /*
      DLC / soundtrack / wallpaper vb.
      mümkün olduğunca temizliyoruz.
    */

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
      "dedicated server",
      "soundtrack dlc"
    ];

    const excluded =
      excludedWords.some(
        (word) =>
          lowerName.includes(word)
      );

    if (excluded) {
      continue;
    }

    /*
      SONUÇ
    */

    games.push({
      id,
      name,
      image,
      price,
      oldPrice,
      currency: "TRY",
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
    /*
      SAYFA

      /api/deals?page=0
      /api/deals?page=1
      /api/deals?page=2
    */

    const page =
      Math.max(
        0,
        Number.parseInt(
          req.query?.page || "0",
          10
        ) || 0
      );

    /*
      Her sayfada 100 oyun.
    */

    const count = 100;

    const start =
      page * count;

    /*
      Steam normal arama sayfası.

      specials=1
        Sadece indirimli ürünler

      category1=998
        Oyunlar

      cc=tr
        Türkiye mağazası

      l=turkish
        Türkçe
    */

    const steamUrl =
      "https://store.steampowered.com/search/" +
      "?specials=1" +
      "&category1=998" +
      `&start=${start}` +
      `&count=${count}` +
      "&cc=tr" +
      "&l=turkish";

    console.log(
      "Steam URL:",
      steamUrl
    );

    /*
      STEAM'DEN SAYFAYI ÇEK
    */

    const response =
      await fetch(
        steamUrl,
        {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0 Safari/537.36",

            "Accept":
              "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

            "Accept-Language":
              "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",

            "Referer":
              "https://store.steampowered.com/"
          }
        }
      );

    console.log(
      "Steam HTTP:",
      response.status
    );

    if (!response.ok) {
      throw new Error(
        `Steam HTTP ${response.status}`
      );
    }

    /*
      HTML AL
    */

    const html =
      await response.text();

    if (!html || html.length < 1000) {
      throw new Error(
        "Steam boş veya geçersiz HTML döndürdü"
      );
    }

    /*
      OYUNLARI AYRIŞTIR
    */

    const games =
      parseSteamGames(html);

    console.log(
      `Steam oyun sayısı: ${games.length}`
    );

    /*
      Eğer Steam HTML döndürdü ama
      hiçbir oyun bulamadıysak hata ver.
    */

    if (games.length === 0) {
      throw new Error(
        "Steam sayfası geldi fakat indirimli oyun bulunamadı"
      );
    }

    /*
      JSON CEVABI
    */

    return res.status(200).json({
      source: "Steam",
      page,
      count: games.length,
      nextPage:
        games.length >= count
          ? page + 1
          : null,
      updatedAt:
        new Date().toISOString(),
      games
    });

  } catch (error) {
    console.error(
      "STEAM API HATASI:",
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
