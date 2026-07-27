// @poi/core는 브라우저 번들에서도 Buffer.from(...).toString("hex")만 사용한다.
// Node 전용 전체 polyfill 대신 그 두 동작만 제공한다.
if (!("Buffer" in globalThis)) {
    (globalThis as typeof globalThis & {Buffer: unknown}).Buffer = {
        from(value: string | ArrayBufferView, encoding?: string) {
            const bytes = typeof value === "string"
                ? new TextEncoder().encode(value)
                : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
            return {
                toString(format: string) {
                    if (format !== "hex" || (encoding && encoding !== "utf8")) {
                        throw new Error("지원하지 않는 Buffer 인코딩입니다.");
                    }
                    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
                },
            };
        },
    };
}
