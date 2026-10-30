export type TurnstileConfig = { enabled: boolean; siteKey: string | null };
type Options = {
  sitekey: string; action: 'login' | 'register'; theme: 'light'; size: 'flexible' | 'compact'; language: 'es';
  'response-field': false;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  'timeout-callback': () => void;
};
export type TurnstileAPI = { render: (container: HTMLElement, options: Options) => string; remove: (id: string) => void };
declare global { interface Window { turnstile?: TurnstileAPI } }
let scriptPromise: Promise<TurnstileAPI> | null = null;
export function loadTurnstile(): Promise<TurnstileAPI> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileAPI>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true;
    const fail = () => { clearTimeout(timer); script.remove(); reject(new Error('No pudimos cargar la verificación de seguridad.')); };
    const timer = setTimeout(fail, 12000);
    script.onload = () => { if (!window.turnstile) { fail(); return; } clearTimeout(timer); resolve(window.turnstile); };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch(error => { scriptPromise = null; throw error; });
  return scriptPromise;
}
