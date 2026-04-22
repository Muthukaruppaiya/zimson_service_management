import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { applyAppFavicon, getAppFaviconUrl, refreshAppBrandingFromServer } from "./lib/appBranding";

applyAppFavicon(getAppFaviconUrl());
void refreshAppBrandingFromServer();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
