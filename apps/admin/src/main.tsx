import { createRoot } from "react-dom/client";
import App from "./app";
import { MotionRoot } from "./motion";
import "./styles.css";
import "./motion.css";

const root = document.getElementById("root");
if (!root) throw new Error("缺少应用挂载节点");
createRoot(root).render(
  <MotionRoot>
    <App />
  </MotionRoot>,
);
