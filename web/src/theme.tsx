import {useEffect, useState} from "react";

/**
 * 두 정체성을 전환한다.
 *
 *   dark   기와 지붕 아래 — --seal 이 #FF2200 로 GIWA 원색과 같다
 *   light  한지 위의 증서 — POI 고유
 *
 * **기본은 dark다.** `prefers-color-scheme`에 맡겨 봤더니 라이트 OS를 쓰는 사람에게는
 * GIWA 정렬이 아예 보이지 않았다. 그래서 시스템 설정을 읽지 않고 고정한다.
 */
export type Theme = "dark" | "light";

const KEY = "poi.theme";

export function storedTheme(): Theme {
    try {
        return localStorage.getItem(KEY) === "light" ? "light" : "dark";
    } catch {
        // 사파리 프라이빗 모드 등에서 localStorage 접근이 던진다. 기본값으로 간다.
        return "dark";
    }
}

/** dark일 때는 속성을 지운다 — :root 자체가 dark이므로 속성이 없는 상태가 기본이다. */
export function applyTheme(theme: Theme): void {
    const root = document.documentElement;
    if (theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
}

export function ThemeToggle() {
    const [theme, setTheme] = useState<Theme>(storedTheme);

    useEffect(() => {
        applyTheme(theme);
        try {
            localStorage.setItem(KEY, theme);
        } catch {
            // 저장하지 못해도 이번 세션 표시는 정상이다.
        }
    }, [theme]);

    const next: Theme = theme === "dark" ? "light" : "dark";
    return (
        <button
            className="btn-quiet theme-toggle"
            type="button"
            aria-label={next === "light" ? "한지 증서 모드로 전환" : "기와 모드로 전환"}
            onClick={() => setTheme(next)}
        >
            {theme === "dark" ? "한지" : "기와"}
        </button>
    );
}
