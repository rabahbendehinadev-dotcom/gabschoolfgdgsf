import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initPwa } from "@/lib/pwa";
import { LocaleProvider } from "@/i18n";

initPwa();

createRoot(document.getElementById("root")!).render(
  <LocaleProvider>
    <App />
  </LocaleProvider>,
);
