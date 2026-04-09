import { NextRequest, NextResponse } from "next/server";
import { Vibrant } from "node-vibrant/node";

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "Missing domain" }, { status: 400 });
  }

  const googleUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;
  // Serve the favicon through our own route so the browser never hits Google directly
  const faviconUrl = `/api/favicon/image?domain=${domain}`;

  try {
    const imgRes = await fetch(googleUrl);
    if (!imgRes.ok) throw new Error("Failed to fetch favicon");

    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const palette = await Vibrant.from(buffer).getPalette();

    const swatch =
      palette.Vibrant ??
      palette.DarkVibrant ??
      palette.LightVibrant ??
      palette.Muted ??
      palette.DarkMuted;

    const color = swatch ? swatch.hex : "#6b7280";

    return NextResponse.json({ faviconUrl, color });
  } catch {
    return NextResponse.json({ faviconUrl, color: "#6b7280" });
  }
}
