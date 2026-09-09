import { NextResponse } from "next/server";
import { GATE_COOKIE_NAME, GATE_COOKIE_VALUE, isGatePassword } from "../../../lib/gate";

export async function POST(request: Request): Promise<NextResponse> {
  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Ungueltige Anfrage." }, { status: 400 });
  }

  if (!isGatePassword(password)) {
    return NextResponse.json({ ok: false, error: "Falsches Passwort." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE_NAME, GATE_COOKIE_VALUE, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 90, // 90 Tage
    path: "/",
  });
  return response;
}

/**
 * Loescht das Gate-Cookie wieder. httpOnly-Cookies koennen nicht per
 * client-seitigem JS entfernt werden, deshalb gibt es dafuer diesen
 * Endpunkt - genutzt von der Cookie-Einstellungen-Seite als
 * Selbstbedienungs-Loeschung.
 */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(GATE_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
