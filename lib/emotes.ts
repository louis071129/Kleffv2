import type { z } from "zod";
import type { EmoteSchema } from "@klaeff/protocol";

export type Emote = z.infer<typeof EmoteSchema>;

export const EMOTES: { key: Emote; icon: string; label: string }[] = [
  { key: "WAU", icon: "🐕", label: "Wau!" },
  { key: "KNURR", icon: "😤", label: "Knurr" },
  { key: "SCHWANZWEDELN", icon: "〰️", label: "Schwanzwedeln" },
  { key: "WINSELN", icon: "🥺", label: "Winseln" },
  { key: "APPLAUS", icon: "👏", label: "Applaus" },
  { key: "AUGENROLLEN", icon: "🙄", label: "Augenrollen" },
  { key: "HERZ", icon: "❤️", label: "Herz" },
  { key: "SCHOCK", icon: "😱", label: "Schock" },
];

export const EMOTE_ICON: Record<Emote, string> = Object.fromEntries(EMOTES.map((e) => [e.key, e.icon])) as Record<
  Emote,
  string
>;
