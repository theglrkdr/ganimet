import { getStore } from "@netlify/blobs";

const SHOPS = "61,16,35,48,62"; // Steam, Epic, GOG, Microsoft/Xbox, Ubisoft
const PAGE_SIZE = 200;
const MAX_PAGES = 3; // guvenlik siniri (en fazla ~600 oyun)

async function fetchAllDeals(apiKey, country, shopIdsCsv) {
  let all = [];
  let offset = 0;
  const shopsQuery = shopIdsCsv;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `https://api.isthereanydeal.com/deals/v2?key=${apiKey}&country=${country}&limit=${PAGE_SIZE}&offset=${offset}&sort=-cut&shops=${shopsQuery}`;
    const res = await fetch(url);
    const data = await res.json();
    const list = data.list || [];
    all = all.concat(list);
    if (list.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

export default async () => {
  const apiKey = process.env.ITAD_API_KEY;

  try {
    const tryDeals = await fetchAllDeals(apiKey, "TR", SHOPS);

    let usdToTry = null;
    try {
      const fxRes = await fetch("https://api.frankfurter.app/latest?from=USD&to=TRY");
      const fxData = await fxRes.json();
      usdToTry = fxData.rates && fxData.rates.TRY;
    } catch (e) {
      console.error("Kur bilgisi alinamadi:", e);
    }

    const games = tryDeals.map(item => ({
      id: item.id,
      name: item.title,
      image: (item.assets && (item.assets.banner600 || item.assets.banner400 || item.assets.boxart)) || "",
      price: item.deal.price.amount,
      currency: item.deal.price.currency,
      oldPrice: item.deal.regular.amount,
      cut: item.deal.cut,
      shop: item.deal.shop.name,
      shopId: item.deal.shop.id,
      url: item.deal.url,
    }));

    const store = getStore("ganimet-deals");
    await store.setJSON("latest", {
      updatedAt: new Date().toISOString(),
      usdToTry,
      games,
    });

    console.log(`Ganimet: ${games.length} indirim guncellendi`);
  } catch (err) {
    console.error("Ganimet veri cekme hatasi:", err);
  }
};

export const config = {
  schedule: "0 */6 * * *",
};
