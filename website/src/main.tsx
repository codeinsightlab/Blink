import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import App from "./App";
import "./style.css";
const root = document.getElementById("root")!;
// The prerendered HTML is SEO content only. Rendering from scratch prevents
// hydration from briefly reconciling the server's default locale/platform with
// the synchronous values established by the head bootstrap.
const app = createRoot(root);
flushSync(() => app.render(<App />));
document.documentElement.classList.add("blink-ready");
