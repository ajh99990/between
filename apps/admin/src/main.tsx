import { UiProvider } from "@between/ui";
import { createRoot } from "react-dom/client";
import App from "./app";
import "./styles.css";
import "./motion.css";

const root = document.getElementById("root");
if (!root) throw new Error("缺少应用挂载节点");
const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
createRoot(root).render(
  <UiProvider nonce={nonce}>
    <App />
  </UiProvider>,
);
