import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Settings from "./components/Settings";
import { getConfig } from "./lib/commands";
import { applyFontSize } from "./lib/applyTheme";
import "./styles/global.css";

const page = new URLSearchParams(window.location.search).get("page");

getConfig()
  .then((cfg) => {
    applyFontSize(cfg.appearance.font_size);
  })
  .catch(() => {
    /* use CSS default */
  });

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <StrictMode>{page === "settings" ? <Settings /> : <App />}</StrictMode>,
);
