import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SettingsApp } from "./SettingsApp";
import { SpotlightApp } from "./SpotlightApp";
import "./styles/global.css";

const viewParam = new URLSearchParams(window.location.search).get("view");

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      {viewParam === "settings" ? (
        <SettingsApp />
      ) : viewParam === "spotlight" ? (
        <SpotlightApp />
      ) : (
        <App />
      )}
    </StrictMode>,
  );
}
