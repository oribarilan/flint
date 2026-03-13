import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Settings from "./components/Settings";
import "./styles/global.css";

const page = new URLSearchParams(window.location.search).get("page");

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.getElementById("root")!).render(
  <StrictMode>{page === "settings" ? <Settings /> : <App />}</StrictMode>,
);
