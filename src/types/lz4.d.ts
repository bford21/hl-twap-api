declare module 'lz4' {
  export function decode(input: Buffer): Buffer;
  export function encode(input: Buffer, options?: any): Buffer;
}

