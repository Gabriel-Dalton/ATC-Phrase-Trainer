import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import "./styles/global.css";
import App from "./App";
import { session } from "./engine/session";
import { world } from "./engine/world";
import { tts } from "./audio/tts";

// Test hook: lets end-to-end tests drive the engine directly.
declare global {
  interface Window {
    __atc?: { session: typeof session; world: typeof world; tts: typeof tts };
  }
}
window.__atc = { session, world, tts };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
