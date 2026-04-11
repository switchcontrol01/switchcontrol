import { createRoot } from "react-dom/client";
import "./lib/api"; // must be first — installs global fetch interceptor for Electron
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
