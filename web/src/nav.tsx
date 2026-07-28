import type {Route} from "./router";
import {Wallet, type WalletState} from "./wallet";

function isCurrent(route: Route, name: "home" | "record" | "me" | "verify"): boolean {
    return route.name === name;
}

export function Nav({route, wallet, onWalletChange}: {
    route: Route;
    wallet: WalletState;
    onWalletChange: (state: WalletState) => void;
}) {
    const links = [
        {name: "home" as const, href: "#/", label: "홈"},
        {name: "record" as const, href: "#/record", label: "기록하기", needsWallet: true},
        {name: "me" as const, href: "#/me", label: "내 기록", needsWallet: true},
        {name: "verify" as const, href: "#/verify", label: "검증하기"},
    ];

    return <nav className="site-nav" aria-label="주요 탐색">
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
        <Wallet state={wallet} onChange={onWalletChange} />
        <span className="site-nav__chain" aria-label="chainId 91342">· 91342</span>
    </nav>;
}
