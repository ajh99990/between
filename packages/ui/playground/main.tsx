import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@between/ui/styles.css";
import "./playground.css";
import { Playground } from "./playground";

const root = document.getElementById("root");
if (!root) throw new Error("组件工作台入口不存在。");
createRoot(root).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
