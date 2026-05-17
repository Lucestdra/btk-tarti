import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./popup.css";

const node = document.getElementById("root");
if (!node) throw new Error("popup root missing");
createRoot(node).render(<App />);
