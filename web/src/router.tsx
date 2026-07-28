import {useSyncExternalStore} from "react";
import type {Address, Hex} from "viem";

export type Route =
    | {name: "home"}
    | {name: "record"}
    | {name: "me"}
    | {name: "decision"; uid: Hex}
    | {name: "verify"}
    | {name: "passport"; address: Address}
    | {name: "fixtures"}
    | {name: "notFound"; raw: string};

const UID_PATTERN = /^0x[0-9a-f]{64}$/i;
const ADDRESS_PATTERN = /^0x[0-9a-f]{40}$/i;

export function parseRoute(hash: string): Route {
    if (hash === "" || hash === "#" || hash === "#/") return {name: "home"};
    if (hash === "#/record") return {name: "record"};
    if (hash === "#/me") return {name: "me"};
    if (hash === "#/verify") return {name: "verify"};
    if (hash === "#/fixtures") return {name: "fixtures"};

    const decision = hash.match(/^#\/d\/(.+)$/);
    if (decision && UID_PATTERN.test(decision[1])) {
        return {name: "decision", uid: decision[1].toLowerCase() as Hex};
    }

    const passport = hash.match(/^#\/passport\/(.+)$/);
    if (passport && ADDRESS_PATTERN.test(passport[1])) {
        return {name: "passport", address: passport[1].toLowerCase() as Address};
    }

    return {name: "notFound", raw: hash};
}

export function routeToHash(route: Route): string {
    switch (route.name) {
        case "home": return "#/";
        case "record": return "#/record";
        case "me": return "#/me";
        case "decision": return `#/d/${route.uid.toLowerCase()}`;
        case "verify": return "#/verify";
        case "passport": return `#/passport/${route.address.toLowerCase()}`;
        case "fixtures": return "#/fixtures";
        case "notFound": return route.raw;
    }
}

function subscribe(onStoreChange: () => void): () => void {
    window.addEventListener("hashchange", onStoreChange);
    return () => window.removeEventListener("hashchange", onStoreChange);
}

function currentHash(): string {
    return window.location.hash;
}

export function useRoute(): Route {
    const hash = useSyncExternalStore(subscribe, currentHash, () => "");
    return parseRoute(hash);
}

export function navigate(route: Route): void {
    window.location.hash = routeToHash(route);
}
