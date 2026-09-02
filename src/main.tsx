import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Design-review harness: `?preview=1` in dev runs the app against fixtures
// instead of Tauri, so pages can be inspected without a backend or a build.
if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
  const { installPreviewBackend } = await import("./dev/previewBackend");
  installPreviewBackend();
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
