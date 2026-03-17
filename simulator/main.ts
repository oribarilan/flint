/**
 * Simulator entry point.
 *
 * Installs Tauri mocks BEFORE importing the real app, so the app
 * never knows it's running outside of Tauri.
 */
import { installSimulator } from "./mock-tauri";

// Install mocks synchronously before any app code runs
installSimulator();

// Now load the real app — it will use our mocked __TAURI_INTERNALS__
import("../src/main.tsx");
