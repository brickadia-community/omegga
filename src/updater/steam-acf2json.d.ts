declare module 'steam-acf2json' {
  export default {
    decode: (_data: string) => Record<string, unknown>,
    encode: (_data: Record<string, unknown>) => string,
  };
}
