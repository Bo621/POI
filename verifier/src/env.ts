import {isAddress, isHex, type Address, type Hex} from "viem";

export function requiredAddress(name: string): Address {
    const value = process.env[name];
    if (!value || !isAddress(value)) throw new Error(`${name} 환경 변수가 올바른 주소가 아니다.`);
    return value;
}

/**
 * POI 스키마 UID. **필수다** — 없으면 다른 스키마의 attestation 을
 * POI 기록으로 읽어 MATCH 를 내줄 수 있다.
 */
export function requiredSchemaUID(name: string): Hex {
    const value = process.env[name];
    if (!value || !isHex(value) || value.length !== 66) {
        throw new Error(`${name} 환경 변수가 올바른 32바이트 UID 가 아니다.`);
    }
    return value;
}
