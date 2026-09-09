/** Deutsche Wertungssprueche je nach Score-Bereich - reine Show, keine Wertungslogik. */
const TIERS: { min: number; quips: string[] }[] = [
  { min: 90, quips: ["LEGENDÄR!", "Das war Kunst!", "Nachbarn wach, Sieg sicher."] },
  { min: 75, quips: ["Starker Bell!", "Da wackelt die Wand.", "Ordentlich Wumms."] },
  { min: 55, quips: ["Solide!", "Geht klar.", "Kein Meisterwerk, aber okay."] },
  { min: 35, quips: ["Da geht mehr.", "Bisschen mehr Mumm bitte.", "Der Nachbarshund war lauter."] },
  { min: 0, quips: ["War das ein Bellen?", "Mehr Hund, weniger Hauch.", "Try again, Champ."] },
];

export function scoreQuip(total: number, seed = Math.random()): string {
  const tier = TIERS.find((t) => total >= t.min) ?? TIERS[TIERS.length - 1]!;
  const index = Math.floor(seed * tier.quips.length) % tier.quips.length;
  return tier.quips[index] ?? tier.quips[0]!;
}
