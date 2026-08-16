import { getStore } from "@netlify/blobs";

export default async () => {
  const apiKey = process.env.ITAD_API_KEY;
  const url = `https://api.isthereanydeal.com/deals/v2?key=${apiKey}&country=TR&limit=60&sort=-cut`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    const games = (data.list || []).map(item => ({
      id: item.id,
      name: item.title,
      image: (item.assets && (item.assets.banner600 || item.assets.banner400 || item.assets.boxart)) || "",
      price: item.deal.price.amount,
      currency: item.deal.price.currency,
      oldPrice: item.deal.regular.amount,
      cut: item.deal.cut,
      shop: item.deal.shop.name,
      url: item.deal.url,
    }));

    const store = getStore("ganimet-deals");
    await store.setJSON("latest", {
      updatedAt: new Date().toISOString(),
      games,
    });

    console.log(`Ganimet: ${games.length} indirim guncellendi`);
  } catch (err) {
    console.error("Ganimet veri cekme hatasi:", err);
  }
};
