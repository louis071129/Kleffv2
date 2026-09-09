"use client";

import { useState } from "react";

export default function GatePage(): React.ReactElement {
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "wrong">("idle");

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setStatus("checking");
    try {
      const response = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        // Neu laden statt navigieren: die urspruenglich angefragte Adresse
        // (z.B. ein /j/CODE-Einladungslink) bleibt so erhalten.
        window.location.reload();
        return;
      }
      setStatus("wrong");
    } catch {
      setStatus("wrong");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 px-5 py-10 text-center">
      <h1 className="font-display text-5xl text-[var(--lime)]">KLÄFF</h1>
      <div className="klaeff-card w-full p-5" style={{ ["--card-shadow-color" as string]: "var(--bark)" }}>
        <h2 className="font-display text-2xl">Bald verfügbar 🐕</h2>
        <p className="mt-2 text-sm">
          KLÄFF ist noch nicht öffentlich freigegeben. Wer eingeladen wurde, kennt das Passwort.
        </p>
        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <input
            type="password"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setStatus("idle");
            }}
            placeholder="Passwort"
            className="min-h-[44px] w-full rounded-lg border-2 border-[var(--ink)] bg-white px-3 py-2 text-center text-[var(--ink)]"
          />
          <button type="submit" className="klaeff-btn klaeff-btn--lime w-full" disabled={status === "checking"}>
            {status === "checking" ? "Prüfe..." : "Rein"}
          </button>
        </form>
        {status === "wrong" && (
          <p className="mt-3 text-sm text-[var(--pink)]">Falsches Passwort. Nochmal versuchen.</p>
        )}
      </div>
    </main>
  );
}
