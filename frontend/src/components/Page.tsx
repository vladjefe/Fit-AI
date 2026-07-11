import { motion } from "framer-motion";
import type { PropsWithChildren } from "react";

export function Page({ children }: PropsWithChildren) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="min-h-full px-4 pb-28 pt-[max(18px,env(safe-area-inset-top))]"
    >
      {children}
    </motion.main>
  );
}

