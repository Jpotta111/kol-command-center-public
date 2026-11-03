import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App";
import Pricing from "./components/Pricing";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {window.location.pathname.replace(/\/+$/, "") === "/pricing" ? <Pricing /> : <App />}
    <Analytics />
  </React.StrictMode>
);
