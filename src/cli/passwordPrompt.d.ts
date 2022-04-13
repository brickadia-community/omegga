declare module 'password-prompt' {
  const prompt: (message: string) => Promise<string>;
  export default prompt;
}
