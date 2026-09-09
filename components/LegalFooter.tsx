import Link from "next/link";

/**
 * Muss von jeder oeffentlich erreichbaren Seite aus verlinkt sein (auch vom
 * Gate-Screen) - das Impressum darf laut §5 DDG nicht hinter einer
 * Passwortsperre versteckt werden. Siehe middleware.ts fuer die Ausnahme.
 */
export function LegalFooter(): React.ReactElement {
  return (
    <footer className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center text-xs text-[var(--muted)]">
      <Link href="/impressum" className="underline-offset-2 hover:underline">
        Impressum
      </Link>
      <Link href="/datenschutz" className="underline-offset-2 hover:underline">
        Datenschutz
      </Link>
      <Link href="/nutzungsbedingungen" className="underline-offset-2 hover:underline">
        Nutzungsbedingungen
      </Link>
      <Link href="/cookie-einstellungen" className="underline-offset-2 hover:underline">
        Cookie-Einstellungen
      </Link>
    </footer>
  );
}
