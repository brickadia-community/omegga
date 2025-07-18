declare module 'steam-acf2json' {
  export default {
    decode: (data: string) => Record<string, unknown>,
    encode: (data: Record<string, unknown>) => string,
  };
}
