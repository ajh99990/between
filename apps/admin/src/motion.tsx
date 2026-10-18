import { isKeyboardInput, useUiReducedMotion } from "@between/ui";
import { motion } from "motion/react";
import type { ReactNode } from "react";

const easeOut = [0.23, 1, 0.32, 1] as const;

export function RouteContent({ children }: { children: ReactNode }) {
  const reduce = useUiReducedMotion();
  const immediate = reduce || isKeyboardInput();
  return (
    <motion.main
      className="main-content"
      id="main-content"
      initial={immediate ? false : { opacity: 0.84 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: easeOut }}
    >
      {children}
    </motion.main>
  );
}
