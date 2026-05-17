import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { SettingsApp } from "./SettingsApp";
import "./styles/global.css";

const isSettings = new URLSearchParams(window.location.search).get("view") === "settings";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      {isSettings ? <SettingsApp /> : <App />}
    </StrictMode>,
  );
}
