declare module 'k6/crypto' {
  function hmac(
    algorithm: string,
    key: string | ArrayBuffer,
    data: string,
    outputEncoding: string,
  ): ArrayBuffer;
  function sha256(data: string, outputEncoding: string): string;
  function hexEncode(data: ArrayBuffer): string;
  export default { hmac, sha256, hexEncode };
}
