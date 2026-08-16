const PAGE_SIZE = 100;
const MAX_PAGES_PER_RUN = 10;

async function fetchSteamPage(page) {
  const start = page * PAGE_SIZE;

  const url =
    "https://store.steampowered.com/search/" +
    `?specials=1` +
    `&start=${start}` +
    `&count=${PAGE_SIZE}` +
    `&cc=us` +
    `&l=english`;

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Steam HTTP ${response.status}`);
  }

  return response.text();
}

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

function price(value = "") {
  const text = cleanHtml(value);
  const match = text.match(/([\d,.]+)/);

  if (!match) return null;

  const number = Number.parseFloat(
    match[1].replace(/,/g, "")
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function parseGames(html) {
  const games = [];
  const seen = new Set();

  const rows =
    html.match(
      /<a[^>]*class="[^"]*search_result_row[^"]*"[\s\S]*?<\/a>/gi
    ) || [];

  for (const row of rows) {
    const idMatch =
      row.match(/data-ds-appid="(\d+)"/);

    const nameMatch =
      row.match(
        /<span[^>]*class="title"[^>]*>([\s\S]*?)<\/span>/i
      );

    const discountMatch =
      row.match(
        /<div[^>]*class="discount_pct"[^>]*>([\s\S]*?)<\/div>/i
      );

    const oldPriceMatch =
      row.match(
        /<div[^>]*class="discount_original_price"[^>]*>([\s\S]*?)<\/div>/i
      );

    const finalPriceMatch =
      row.match(
        /<div[^>]*class="discount_final_price"[^>]*>([\s\S]*?)<\/div>/i
      );

    const imageMatch =
      row.match(
        /<img[^>]+src="([^"]+)"/i
      );

    if (
      !idMatch ||
      !nameMatch ||
      !discountMatch ||
      !finalPriceMatch
    ) {
      continue;
    }

    const appId = idMatch[1];

    if (seen.has(appId)) {
      continue;
    }

    seen.add(appId);

    const name =
      cleanHtml(nameMatch[1]);

    const cut =
      Number.parseInt(
        cleanHtml(discountMatch[1])
          .replace(/[^\d]/g, ""),
        10
      ) || 0;

    const oldPrice =
      price(oldPriceMatch?.[1]);

    const finalPrice =
      price(finalPriceMatch?.[1]);

    if (
      !name ||
      finalPrice === null
    ) {
      continue;
    }

    const lower =
      `${name} ${row}`.toLowerCase();

    const excluded = [
      "soundtrack",
      "ost",
      "wallpaper",
      "artbook",
      "strategy guide",
      "dedicated server"
    ];

    if (
      excluded.some(word =>
        lower.includes(word)
      )
    ) {
      continue;
    }

    games.push({
      id: `steam-${appId}`,
      appId,
      name,
      image:
        imageMatch?.[1] || "",
      price: finalPrice,
      oldPrice,
      cut,
      shop: "Steam",
      shopId: 61,
      currency: "USD",
      url:
        `https://store.steampowered.com/app/${appId}/`
    });
  }

  return games;
}

export default async function handler(req, res) {
  try {
    const requestedPage =
      Math.max(
        0,
        Number.parseInt(
          req.query?.page || "0",
          10
        ) || 0
      );

    const games = [];

    for (
      let i = 0;
      i < MAX_PAGES_PER_RUN;
      i++
    ) {
      const page =
        requestedPage + i;

      const html =
        await fetchSteamPage(page);

      const pageGames =
        parseGames(html);

      games.push(...pageGames);

      console.log(
        `Steam import: page ${page}, ${pageGames.length} oyun`
      );

      if (
        pageGames.length < PAGE_SIZE
      ) {
        break;
      }
    }

    const uniqueGames = [
      ...new Map(
        games.map(game => [
          game.appId,
          game
        ])
      ).values()
    ];

    return res.status(200).json({
      source: "Steam",
      startPage: requestedPage,
      pagesProcessed:
        Math.min(
          MAX_PAGES_PER_RUN,
          Math.max(
            1,
            Math.ceil(
              uniqueGames.length /
                PAGE_SIZE
            )
          )
        ),
      count:
        uniqueGames.length,
      nextPage:
        uniqueGames.length >=
        MAX_PAGES_PER_RUN * PAGE_SIZE
          ? requestedPage +
            MAX_PAGES_PER_RUN
          : null,
      games: uniqueGames
    });

  } catch (error) {
    console.error(
      "Steam import hatası:",
      error
    );

    return res.status(500).json({
      error:
        "Steam import başarısız",
      message:
        error?.message ||
        "Bilinmeyen hata",
      games: []
    });
  }
}
