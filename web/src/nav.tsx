import {useEffect, useRef} from "react";
import type {Route} from "./router";
import {ThemeToggle} from "./theme";
import {Wallet, type WalletState} from "./wallet";

function isCurrent(route: Route, name: "home" | "record" | "me" | "verify"): boolean {
    return route.name === name;
}

export function Nav({route, wallet, onWalletChange}: {
    route: Route;
    wallet: WalletState;
    onWalletChange: (state: WalletState) => void;
}) {
    // nav 는 고정 배치인데 높이가 내용에 따라 변한다 — 지갑을 연결하면 배지가 붙어 커진다.
    // --nav-height 를 상수로 두었더니 연결 후 본문 <h1> 이 nav 뒤로 가려졌다.
    // 상수를 키우는 대신 실측값을 알린다. 내용이 또 늘어도 같은 일이 반복되지 않는다.
    const navRef = useRef<HTMLElement>(null);
    useEffect(() => {
        const el = navRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(([entry]) => {
            const h = entry?.borderBoxSize?.[0]?.blockSize ?? el.getBoundingClientRect().height;
            document.documentElement.style.setProperty("--nav-height", `${Math.ceil(h)}px`);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const links = [
        {name: "home" as const, href: "#/", label: "홈"},
        {name: "record" as const, href: "#/record", label: "기록하기", needsWallet: true},
        {name: "me" as const, href: "#/me", label: "내 기록", needsWallet: true},
        {name: "verify" as const, href: "#/verify", label: "검증하기"},
    ];

    return <nav className="site-nav" aria-label="주요 탐색" ref={navRef}>
        <a className="site-nav__brand" href="#/">POI 판단 증서</a>
        <div className="site-nav__links">
            {links.map((link) => <a
                key={link.name}
                href={link.href}
                className={link.needsWallet && !wallet.address ? "site-nav__link--muted" : undefined}
                aria-current={isCurrent(route, link.name) ? "page" : undefined}
            >
                {link.label}
            </a>)}
        </div>
        <ThemeToggle />
        <Wallet state={wallet} onChange={onWalletChange} />
        <span className="site-nav__chain" aria-label="chainId 91342">· 91342</span>
    </nav>;
}
