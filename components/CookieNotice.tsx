"use client";

import { useEffect, useState } from "react";
import { dismissCookieNotice, isCookieNoticeDismissed } from "../lib/storage";

/**
 * Reiner Transparenz-Hinweis, kein Consent-Dialog: KLÄFF setzt ausschliesslich
 * technisch notwendige Cookies/LocalStorage (siehe Datenschutzerklaerung
 * Abschnitt 4+5), fuer die § 25 Abs. 2 Nr. 2 TDDDG keine Einwilligung
 * vorschreibt. Es gibt daher bewusst keinen "Ablehnen"-Button, der etwas
 * abschalten koennte, das ohnehin noetig ist - stattdessen Transparenz plus
 * Link zu den Details/zur Loeschmoeglichkeit.
 */
export function CookieNotice(): React.ReactElement | null {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!isCookieNoticeDismissed());
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-label="Hinweis zu Cookies"
      className="klaeff-card fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md flex-col gap-2 p-4 text-xs sm:text-sm"
      style={{ ["--card-shadow-color" as string]: "var(--ink)" }}
    >
      <p>
        KLÄFF verwendet nur technisch notwendige Cookies/lokale Daten (Zugang,
        Spitzname, Avatar, Mikrofon-Kalibrierung) – kein Tracking, keine
        Werbung.{" "}
        <a href="/datenschutz" className="underline underline-offset-2">
          Mehr dazu
        </a>
        .
      </p>
      <button
        type="button"
        className="klaeff-btn klaeff-btn--lime self-end px-4 py-2 text-xs sm:text-sm"
        onClick={() => {
          dismissCookieNotice();
          setVisible(false);
        }}
      >
        Verstanden
      </button>
    </div>
  );
}
