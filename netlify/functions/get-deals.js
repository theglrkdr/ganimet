import { getStore } from "@netlify/blobs";

export default async () => {
  const store = getStore("ganimet-deals");
  const data = await store.get("latest", { type: "json" });

  return new Response(JSON.stringify(data || { games: [] }), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config = {
  path: "/api/deals",
};
