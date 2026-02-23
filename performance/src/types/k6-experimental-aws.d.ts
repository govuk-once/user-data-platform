declare module 'k6/crypto' {
  export function hmac(
    algorithm: string,
    key: string | ArrayBuffer,
    data: string,
    outputEncoding: string,
  ): string;
  export function sha256(data: string, outputEncoding: string): string;
  const _default: { hmac: typeof hmac; sha256: typeof sha256 };
  export default _default;
}

declare module 'k6/encoding' {
  export function b64decode(data: string, encoding?: string): ArrayBuffer;
  const _default: { b64decode: typeof b64decode };
  export default _default;
}
