import type { HTMLAttributes, PropsWithChildren } from "react";

type CardProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  tone?: "default" | "soft" | "accent";
};

export function Card({ children, className = "", tone = "default", ...props }: CardProps) {
  const tones = {
    default: "bg-surface border-white/[0.07]",
    soft: "bg-surface-soft border-white/[0.05]",
    accent: "bg-accent text-ink border-accent",
  };
  return (
    <div
      className={`rounded-[22px] border ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

