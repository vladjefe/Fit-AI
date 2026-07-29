import { storage } from "./native";

const TOKEN_KEY = "fitai.device_token";
const API_URL = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000/api/v1";

let cachedToken: string | null = null;
let loaded = false;

export async function loadToken(): Promise<string | null> {
  if (!loaded) {
    cachedToken = await storage.get(TOKEN_KEY);
    loaded = true;
  }
  return cachedToken;
}

/** Синхронный доступ для заголовков запросов: loadToken уже отработал при старте. */
export function currentToken(): string | null {
  return cachedToken;
}

export async function pairDevice(code: string, deviceName: string): Promise<void> {
  const response = await fetch(`${API_URL}/auth/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, device_name: deviceName }),
  });
  const data = (await response.json().catch(() => null)) as
    | { token?: string; detail?: string }
    | null;
  if (!response.ok || !data?.token) {
    throw new Error(data?.detail ?? "Не удалось привязать устройство");
  }
  cachedToken = data.token;
  loaded = true;
  await storage.set(TOKEN_KEY, data.token);
}

export async function forgetToken(): Promise<void> {
  const token = cachedToken;
  cachedToken = null;
  loaded = true;
  await storage.remove(TOKEN_KEY);
  if (!token) return;
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {});
}
