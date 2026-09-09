import type { AvatarSeed } from "@klaeff/protocol";

const FUR_COLORS = ["#D9A066", "#4A4A4A", "#F4EFE4", "#8B5A2B"];
const COLLAR_COLORS = ["#FF5C1A", "#B8FF3D", "#7A5CFF", "#FF2D8A", "#1C1A24", "#F4EFE4", "#8B5A2B", "#4A4A4A"];

const HEAD_PATHS = [
  // rund
  "M50 8C24 8 10 28 10 52c0 24 16 40 40 40s40-16 40-40C90 28 76 8 50 8Z",
  // eckig
  "M18 14h64v56c0 12-10 22-32 22S18 82 18 70V14Z",
  // laenglich (Schnauze-lastig)
  "M50 6C28 6 14 24 14 46c0 30 14 46 36 46s36-16 36-46C86 24 72 6 50 6Z",
  // breit/flauschig
  "M50 10C20 10 6 32 6 54c0 22 20 38 44 38s44-16 44-38c0-22-14-44-44-44Z",
  // eckig-kantig
  "M50 8 14 30v42l36 24 36-24V30L50 8Z",
];

const EAR_SHAPES = [
  // Schlappohr
  { l: "M20 30c-14 4-18 26-8 40 8-4 16-14 18-26z", r: "M80 30c14 4 18 26 8 40-8-4-16-14-18-26z" },
  // Stehohr
  { l: "M24 22 8 4l4 34z", r: "M76 22l16-18-4 34z" },
  // Halbknick
  { l: "M22 24 6 10l10 32z", r: "M78 24l16-14-10 32z" },
  // Rundohr
  { l: "M8 30a10 10 0 1 0 20 0 10 10 0 1 0 -20 0Z", r: "M72 30a10 10 0 1 0 20 0 10 10 0 1 0 -20 0Z" },
  // Spitz
  { l: "M26 20 4 0l8 36z", r: "M74 20l22-20-8 36z" },
  // kaputt
  { l: "M20 30c-14 4-18 22-10 34 6-2 12-10 15-20l-3-14z", r: "M80 30c14 4 12 20 4 30-6-2-10-8-12-16z" },
];

function eyesForStyle(style: number): React.ReactElement {
  switch (style) {
    case 1: // gross/wach
      return (
        <>
          <circle cx="36" cy="52" r="8" fill="var(--avatar-ink,#0B0A0F)" />
          <circle cx="64" cy="52" r="8" fill="var(--avatar-ink,#0B0A0F)" />
          <circle cx="38" cy="49" r="2.5" fill="#fff" />
          <circle cx="66" cy="49" r="2.5" fill="#fff" />
        </>
      );
    case 2: // schlaefrig
      return (
        <>
          <path d="M28 54q8-6 16 0" stroke="var(--avatar-ink,#0B0A0F)" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M56 54q8-6 16 0" stroke="var(--avatar-ink,#0B0A0F)" strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      );
    case 3: // Stern
      return (
        <>
          <path d="M36 44l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="var(--avatar-ink,#0B0A0F)" />
          <circle cx="64" cy="52" r="6" fill="var(--avatar-ink,#0B0A0F)" />
        </>
      );
    case 4: // Zwinkern
      return (
        <>
          <path d="M28 52q8-4 16 0" stroke="var(--avatar-ink,#0B0A0F)" strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="64" cy="52" r="6" fill="var(--avatar-ink,#0B0A0F)" />
        </>
      );
    case 5: // Herzchen
      return (
        <>
          <path d="M36 46c-4-4-10-1-10 4 0 5 10 10 10 10s10-5 10-10c0-5-6-7-10-4z" fill="var(--pink,#FF2D8A)" />
          <path d="M64 46c-4-4-10-1-10 4 0 5 10 10 10 10s10-5 10-10c0-5-6-7-10-4z" fill="var(--pink,#FF2D8A)" />
        </>
      );
    default: // normal
      return (
        <>
          <circle cx="36" cy="52" r="5" fill="var(--avatar-ink,#0B0A0F)" />
          <circle cx="64" cy="52" r="5" fill="var(--avatar-ink,#0B0A0F)" />
        </>
      );
  }
}

function accessoryOverlay(style: number): React.ReactElement | null {
  switch (style) {
    case 1: // Sonnenbrille
      return (
        <g>
          <rect x="24" y="44" width="20" height="12" rx="4" fill="var(--avatar-ink,#0B0A0F)" />
          <rect x="56" y="44" width="20" height="12" rx="4" fill="var(--avatar-ink,#0B0A0F)" />
          <rect x="44" y="48" width="12" height="4" fill="var(--avatar-ink,#0B0A0F)" />
        </g>
      );
    case 2: // Kappe
      return <path d="M12 18c8-14 68-14 76 0-10-6-66-6-76 0Z" fill="var(--bark,#FF5C1A)" stroke="var(--avatar-ink,#0B0A0F)" strokeWidth="3" />;
    case 3: // Zahnspange (kleines Glitzern am Mund)
      return <rect x="42" y="70" width="16" height="4" rx="2" fill="#B0B8C0" />;
    case 4: // Zigarre
      return <rect x="60" y="66" width="26" height="6" rx="3" fill="#C9A063" transform="rotate(10 60 66)" />;
    case 5: // Heiligenschein
      return <ellipse cx="50" cy="4" rx="18" ry="5" fill="none" stroke="var(--lime,#B8FF3D)" strokeWidth="4" />;
    case 6: // Kopfhoerer
      return (
        <g stroke="var(--avatar-ink,#0B0A0F)" strokeWidth="4" fill="var(--steel,#1C1A24)">
          <path d="M10 40a40 40 0 0 1 80 0" fill="none" />
          <rect x="4" y="38" width="12" height="20" rx="4" />
          <rect x="84" y="38" width="12" height="20" rx="4" />
        </g>
      );
    case 7: // Blume
      return (
        <g transform="translate(76 16)">
          <circle r="4" fill="var(--lime,#B8FF3D)" />
          <circle cx="6" r="4" fill="var(--pink,#FF2D8A)" />
          <circle cx="-6" r="4" fill="var(--pink,#FF2D8A)" />
          <circle cy="6" r="4" fill="var(--violet,#7A5CFF)" />
          <circle cy="-6" r="4" fill="var(--violet,#7A5CFF)" />
        </g>
      );
    case 8: // Verband
      return <rect x="20" y="30" width="30" height="8" rx="4" fill="var(--paper,#F4EFE4)" stroke="var(--avatar-ink,#0B0A0F)" strokeWidth="2" transform="rotate(-15 20 30)" />;
    case 9: // Krone
      return <path d="M18 20 30 4l10 12 10-16 10 16 12-12 4 16H18Z" fill="var(--lime,#B8FF3D)" stroke="var(--avatar-ink,#0B0A0F)" strokeWidth="3" strokeLinejoin="round" />;
    case 10: // Bauhelm
      return <path d="M14 22c6-16 66-16 72 0 4 2 4 10-4 10H18c-8 0-8-8-4-10Z" fill="var(--bark,#FF5C1A)" stroke="var(--avatar-ink,#0B0A0F)" strokeWidth="3" />;
    default:
      return null;
  }
}

export interface AvatarProps {
  readonly seed: AvatarSeed;
  readonly size?: number;
  /** 0..1, wie weit das Maul offen ist (Live-Pegel). Statisch, wenn nicht gesetzt. */
  readonly mouthOpen?: number;
  readonly className?: string;
  readonly title?: string;
  /** Blinzeln/Ohrenzucken/Schwanzwedeln/Atmen - standardmaessig an, respektiert prefers-reduced-motion global. */
  readonly idle?: boolean;
}

export function Avatar({
  seed,
  size = 96,
  mouthOpen = 0.15,
  className,
  title,
  idle = true,
}: AvatarProps): React.ReactElement {
  const headPath = HEAD_PATHS[seed.headShape % HEAD_PATHS.length] ?? HEAD_PATHS[0]!;
  const ears = EAR_SHAPES[seed.ears % EAR_SHAPES.length] ?? EAR_SHAPES[0]!;
  const furColor = FUR_COLORS[seed.furColor % FUR_COLORS.length] ?? FUR_COLORS[0]!;
  const collarColor = COLLAR_COLORS[seed.collarColor % COLLAR_COLORS.length] ?? COLLAR_COLORS[0]!;
  const mouthHeight = 4 + mouthOpen * 20;
  // Verschiedene Verzoegerungen pro Idle-Animation aus demselben Seed, damit
  // Blinzeln/Ohren/Schwanz nicht im Gleichtakt laufen.
  const delayBase = (seed.idleSeed % 4000) / 1000;
  const idleStyle = (offset: number): React.CSSProperties =>
    idle ? ({ ["--idle-delay" as string]: `${(delayBase + offset).toFixed(2)}s` } as React.CSSProperties) : {};

  return (
    <svg
      viewBox="0 0 100 108"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title ?? "Hunde-Avatar"}
    >
      <g className={idle ? "avatar-idle-breathe" : undefined} style={idleStyle(0)}>
        <path
          d="M84 100c8 4 12 14 6 20-6-2-12-10-14-18Z"
          fill={furColor}
          stroke="#0B0A0F"
          strokeWidth="3"
          strokeLinejoin="round"
          className={idle ? "avatar-idle-tail" : undefined}
          style={idleStyle(0.3)}
        />
        <g className={idle ? "avatar-idle-ear-l" : undefined} style={idleStyle(0.6)}>
          <path d={ears.l} fill={furColor} stroke="#0B0A0F" strokeWidth="3" strokeLinejoin="round" />
        </g>
        <g className={idle ? "avatar-idle-ear-r" : undefined} style={idleStyle(0.9)}>
          <path d={ears.r} fill={furColor} stroke="#0B0A0F" strokeWidth="3" strokeLinejoin="round" />
        </g>
        <path d={headPath} fill={furColor} stroke="#0B0A0F" strokeWidth="4" strokeLinejoin="round" />

        {seed.furPattern === 1 && (
          <g fill="#0B0A0F" opacity="0.25">
            <circle cx="30" cy="30" r="5" />
            <circle cx="66" cy="24" r="4" />
            <circle cx="72" cy="60" r="6" />
          </g>
        )}
        {seed.furPattern === 2 && (
          <g stroke="#0B0A0F" strokeWidth="3" opacity="0.25">
            <path d="M14 40h20M18 56h24M60 30h26M64 66h22" />
          </g>
        )}
        {seed.furPattern === 3 && <path d="M0 70h100v38H0Z" fill="#F4EFE4" opacity="0.35" />}

        <g className={idle ? "avatar-idle-eyes" : undefined} style={idleStyle(1.4)}>
          {eyesForStyle(seed.eyes)}
        </g>

        {/* Schnauze */}
        <ellipse cx="50" cy="70" rx={18 + seed.snout * 2} ry="14" fill="#F4EFE4" stroke="#0B0A0F" strokeWidth="3" />
        <rect x="44" y={64 - mouthHeight / 2} width="12" height={mouthHeight} rx="5" fill="#0B0A0F" data-avatar-mouth="true" />

        {/* Halsband */}
        <path d="M14 96q36 16 72 0" stroke={collarColor} strokeWidth="10" fill="none" strokeLinecap="round" />
        <circle
          cx="50"
          cy="102"
          r="5"
          fill={COLLAR_COLORS[(seed.collarCharm + 3) % COLLAR_COLORS.length]}
          stroke="#0B0A0F"
          strokeWidth="2"
        />

        {accessoryOverlay(seed.accessory)}
      </g>
    </svg>
  );
}
