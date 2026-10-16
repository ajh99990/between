import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect } from "react";
import { Icon } from "./icons";

const easeOut = [0.23, 1, 0.32, 1] as const;

export function MotionRoot({ children }: { children: ReactNode }) {
  useEffect(() => {
    const keyboard = () => {
      document.documentElement.dataset.inputModality = "keyboard";
    };
    const pointer = () => {
      document.documentElement.dataset.inputModality = "pointer";
    };
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerdown", pointer, true);
      delete document.documentElement.dataset.inputModality;
    };
  }, []);
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

export function RouteContent({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const immediate = reduce || document.documentElement.dataset.inputModality === "keyboard";
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

export function FeedbackToast({
  feedback,
  onClose,
}: {
  feedback: { message: string; tone: string } | null;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {feedback && (
        <motion.div
          key="feedback"
          className="toast"
          data-tone={feedback.tone}
          role={feedback.tone === "error" ? "alert" : "status"}
          initial={{ opacity: 0, y: reduce ? 0 : 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0.08 : 0.18, ease: easeOut } }}
          exit={{
            opacity: 0,
            y: reduce ? 0 : 8,
            transition: { duration: reduce ? 0.06 : 0.14, ease: easeOut },
          }}
        >
          <Icon name={feedback.tone === "error" ? "alert" : "check"} />
          <span>{feedback.message}</span>
          <button aria-label="关闭通知" className="icon-button" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
