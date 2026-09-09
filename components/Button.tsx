"use client";

type Variant = "primary" | "secondary" | "lime" | "violet" | "pink";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: Variant;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "",
  secondary: "klaeff-btn--secondary",
  lime: "klaeff-btn--lime",
  violet: "klaeff-btn--violet",
  pink: "klaeff-btn--pink",
};

export function Button({ variant = "primary", className, ...props }: ButtonProps): React.ReactElement {
  const classes = ["klaeff-btn", VARIANT_CLASS[variant], className].filter(Boolean).join(" ");
  return <button className={classes} {...props} />;
}
