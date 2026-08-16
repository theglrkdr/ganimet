export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=TRY"
    );

    if (!response.ok) {
      throw new Error(`Kur servisi HTTP ${response.status}`);
    }

    const data = await response.json();

    const usdTry = Number(data?.rates?.TRY);

    if (!Number.isFinite(usdTry) || usdTry <= 0) {
      throw new Error("USD/TRY kuru alınamadı");
    }

    return res.status(200).json({
      from: "USD",
      to: "TRY",
      rate: usdTry,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error("Kur hatası:", error);

    return res.status(500).json({
      error: "USD/TRY kuru alınamadı",
      message: error?.message || "Bilinmeyen hata"
    });
  }
}
