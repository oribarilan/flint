import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Settings from "./components/Settings";
import { getConfig } from "./lib/commands";
import { applyFontSize, applyTheme, applyBackdropBlur } from "./lib/applyTheme";
import { initKitRegistry } from "./kits";
import "./styles/global.css";
import "./styles/themes.css";

// Initialize kit component registry before rendering.
initKitRegistry();

const page = new URLSearchParams(window.location.search).get("page");

getConfig()
  .then((cfg) => {
    applyFontSize(cfg.appearance.font_size);
    applyTheme(cfg.appearance.theme);
    applyBackdropBlur(cfg.appearance.backdrop_blur);
  })
  .catch(() => {
    /* use CSS default */
  });

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <StrictMode>{page === "settings" ? <Settings /> : <App />}</StrictMode>,
);
