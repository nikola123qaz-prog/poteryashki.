import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App.jsx";
import "@vkontakte/vkui/dist/vkui.css";
import "./ui/styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode><App /></React.StrictMode>
);