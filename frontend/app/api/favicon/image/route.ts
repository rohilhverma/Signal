import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain");
  if (!domain) {
    return new NextResponse(null, { status: 400 });
  }

  const googleUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain}`;

  try {
    const imgRes = await fetch(googleUrl);
    if (!imgRes.ok) return new NextResponse(null, { status: 404 });

    const buffer = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get("content-type") ?? "image/png";

    return new NextResponse(buffer, {
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
