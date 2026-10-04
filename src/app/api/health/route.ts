import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, app: "coach-os", time: new Date().toISOString() });
}
