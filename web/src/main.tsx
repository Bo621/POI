import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {applyTheme, storedTheme} from "./theme";
import "./styles.css";

// 첫 렌더 전에 적용한다 — 이후에 하면 한지 모드 사용자가 검정 화면을 한 번 본다.
applyTheme(storedTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
);
