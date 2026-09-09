/**
 * "Bald verfuegbar"-Passwort-Gate. Kein echtes Sicherheitssystem - ein
 * geteiltes Passwort in einem Cookie ist trivial umgehbar (wie die
 * Device-UUID an anderer Stelle im Projekt, siehe README.md). Der Zweck
 * ist ausschliesslich, die App vor zufaelligen Besuchern zu verstecken,
 * bevor der Besitzer bereit fuer einen oeffentlichen Test ist.
 *
 * Framework-frei (kein Node-, kein Edge-spezifisches API), damit dieselbe
 * Logik sowohl in der Next.js-Middleware (Edge-Runtime) als auch im
 * Custom-Server (Node, fuer den WebSocket-Upgrade) verwendet werden kann.
 */

export const GATE_COOKIE_NAME = "klaeff_gate";
export const GATE_COOKIE_VALUE = "unlocked";
const DEFAULT_PASSWORD = "lars";

function expectedPassword(): string {
  return process.env.GATE_PASSWORD?.trim() || DEFAULT_PASSWORD;
}

export function isGatePassword(input: string): boolean {
  return input === expectedPassword();
}

/** Prueft den rohen "Cookie"-Header (Node- und Fetch-Requests liefern beide einen String). */
export function hasGateCookie(cookieHeader: string | undefined | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${GATE_COOKIE_NAME}=${GATE_COOKIE_VALUE}`);
}
