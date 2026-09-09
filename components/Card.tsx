export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  readonly shadowColor?: string;
}

export function Card({ shadowColor, className, style, ...props }: CardProps): React.ReactElement {
  return (
    <div
      className={["klaeff-card", "p-5", className].filter(Boolean).join(" ")}
      style={{ ...(shadowColor ? { ["--card-shadow-color" as string]: shadowColor } : {}), ...style }}
      {...props}
    />
  );
}
