import { NextResponse } from "next/server";

const NASA_API_KEY = "QDR3SPu7cWhusxn4bQTerT5Zb1ZAY5xXZp4Ydjhg";

export async function GET() {
  try {
    const res = await fetch(
      `https://api.nasa.gov/planetary/apod?api_key=${NASA_API_KEY}`,
      { next: { revalidate: 86400 } } // cache for 24 hours — NASA APOD updates once daily
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
