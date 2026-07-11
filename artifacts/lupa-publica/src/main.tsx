import { setBaseUrl } from "@workspace/api-client-react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rawBaseUrl = (import.meta.env.BASE_URL as string) || "/";
const baseUrl = rawBaseUrl.replace(/\/+$/, "") || null;
if (baseUrl && baseUrl !== "/") {
  setBaseUrl(baseUrl);
}

createRoot(document.getElementById("root")!).render(<App />);
