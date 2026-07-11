import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { PropsWithChildren } from "react";

type ButtonProps = PropsWithChildren<HTMLMotionProps<"button">> & {
  variant?: "primary" | "secondary" | "ghost";
  fullWidth?: boolean;
};

export function Button({
  children,
  variant = "primary",
  fullWidth = false,
  className = "",
  ...props
}: ButtonProps) {
  const variants = {
    primary: "bg-accent text-ink shadow-[0_10px_30px_rgba(183,243,74,0.18)]",
    secondary: "bg-white/[0.075] text-white border border-white/[0.08]",
    ghost: "bg-transparent text-muted",
  };
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.12 }}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] font-extrabold tracking-[-0.01em] transition disabled:cursor-not-allowed disabled:opacity-40 ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
