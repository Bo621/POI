import {isAddress, type Address} from "viem";

export function requiredAddress(name: string): Address {
    const value = process.env[name];
    if (!value || !isAddress(value)) throw new Error(`${name} 환경 변수가 올바른 주소가 아니다.`);
    return value;
}
