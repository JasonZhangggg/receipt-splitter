export function prepareTurnstile(): void {}

export function turnstileToken(): Promise<string> {
  return Promise.reject(new Error("Turnstile runs only on the web"));
}
