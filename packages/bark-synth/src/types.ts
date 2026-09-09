/** Live-Parameter fuer einen einzelnen Synth-Frame (20ms-Takt, wie AudioFrame). */
export interface BarkSynthFrameParams {
  /** Zielfrequenz des Wuff-Koerpers in Hz, komprimiert auf den Hunde-Bereich. */
  readonly pitchHz: number;
  /** Lautstaerke 0..1, folgt dem Pegel der Stimme. */
  readonly gain: number;
  /** Anteil der Rauschburst-Schicht 0..1 - hoch bei rauschartigem (flachem) Signal. */
  readonly noiseMix: number;
}

/** Envelope-Parameter fuer ein komplettes 3s-Bellfenster. */
export interface BarkSynthEnvelope {
  /** 0..1, 1 = sehr harter/schneller Anschlag (kurze Attack-Zeit in der Stimme). */
  readonly attackSharpness: number;
}
