```js
export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://api.frankfurter.app/latest?from=USD&to=TRY"
    );

    if (!response.ok) {
      throw new Error(
        `Kur servisi HTTP ${response.status}`
      );
    }

    const data = await response.json();

    const usdTry = Number(data?.rates?.TRY);

    if (!usdTry || !Number.isFinite(usdTry)) {
      throw new Error("USD/TRY kuru alınamadı");
    }

    return new Response(
      JSON.stringify({
        from: "USD",
        to: "TRY",
        rate: usdTry,
        updatedAt: new Date().toISOString()
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );

  } catch (error) {
    console.error("Kur hatası:", error);

    return new Response(
      JSON.stringify({
        error: "USD/TRY kuru alınamadı",
        message: error?.message || "Bilinmeyen hata"
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
}
```
