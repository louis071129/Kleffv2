"use client";

/**
 * Haelt das Display waehrend eines Matches wach. Scheitert still (kein
 * unterstuetztes Wake-Lock-API, Berechtigung verweigert, etc.) - das ist
 * eine Komfortfunktion, kein kritischer Pfad.
 */
export class WakeLockController {
  private sentinel: WakeLockSentinel | null = null;

  async acquire(): Promise<void> {
    try {
      if ("wakeLock" in navigator) {
        this.sentinel = await navigator.wakeLock.request("screen");
      }
    } catch {
      this.sentinel = null;
    }
  }

  async release(): Promise<void> {
    try {
      await this.sentinel?.release();
    } catch {
      // ignorieren
    } finally {
      this.sentinel = null;
    }
  }

  /** Nach visibilitychange (Tab-Wechsel) muss das Wake Lock neu angefragt werden. */
  async reacquireIfNeeded(): Promise<void> {
    if (this.sentinel === null && document.visibilityState === "visible") {
      await this.acquire();
    }
  }
}
