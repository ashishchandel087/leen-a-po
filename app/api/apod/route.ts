import { NextResponse } from "next/server";

// NASA APOD key. Set NASA_API_KEY in env; falls back to the shared DEMO_KEY
// (heavily rate-limited) so the route still works in local dev without config.
const NASA_API_KEY = process.env.NASA_API_KEY || "DEMO_KEY";

export async function GET() {
  try {
    // Include today's date so each day gets its own cache key — prevents stale images
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD UTC
    const res = await fetch(
      `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}&date=${today}`,
      { next: { revalidate: 86400 } } // cache for 24 hours, auto-busts each new day
    );

    if (!res.ok) {
      throw new Error("Failed to fetch from NASA API");
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch picture of the day" },
      { status: 500 }
    );
  }
}
