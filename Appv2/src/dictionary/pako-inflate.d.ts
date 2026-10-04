/** Inflate a zlib or gzip stream (pako's `inflate`, auto-detecting the header). */
export function inflate(data: Uint8Array): Uint8Array;
