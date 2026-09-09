import Link from "next/link";

export interface LegalPageProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

/**
 * Gemeinsames Geruest fuer alle Rechtstexte: lesbare Fliesstext-Breite statt
 * der schmalen App-Karten, damit lange Absaetze nicht in 20px-Buttons
 * gequetscht werden. Bewusst ausserhalb des Gates erreichbar (siehe
 * middleware.ts).
 */
export function LegalPage({ title, children }: LegalPageProps): React.ReactElement {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 px-5 py-10">
      <Link href="/" className="text-sm text-[var(--lime)] underline-offset-2 hover:underline">
        ← Zurück zu KLÄFF
      </Link>
      <div className="klaeff-card p-6 sm:p-8" style={{ ["--card-shadow-color" as string]: "var(--violet)" }}>
        <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
        <div className="legal-prose mt-5 flex flex-col gap-4 text-sm leading-relaxed sm:text-base">{children}</div>
      </div>
    </main>
  );
}
