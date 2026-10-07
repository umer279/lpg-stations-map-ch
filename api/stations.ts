import { getStations } from "../src/cache.js";

/** Vercel serverless counterpart of the Express `/api/stations` route in src/server.ts. */
export async function GET(request: Request): Promise<Response> {
  const force = new URL(request.url).searchParams.get("refresh") === "1";
  try {
    const data = await getStations(force);
    return Response.json(data, {
      headers: {
        // Function instances are short-lived, so let Vercel's CDN hold the 24h cache.
        "Cache-Control": force
          ? "no-store"
          : "public, s-maxage=86400, stale-while-revalidate=604800",
      },
    });
  } catch (err) {
    console.error("Failed to load stations:", err);
    return Response.json(
      { error: "Could not load stations from OpenStreetMap" },
      { status: 502 },
    );
  }
}
