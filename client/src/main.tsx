import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const isElectron = typeof window !== "undefined" && (
  (window as any).electronAPI?.isElectron === true ||
  (window as any).switchControl?.ready === true ||
  navigator.userAgent.toLowerCase().includes("electron")
);

if (isElectron) {
  (window as any).__IS_ELECTRON__ = true;
}

createRoot(document.getElementById("root")!).render(<App />);
