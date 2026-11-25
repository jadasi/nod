/**
 * Device storage. The device token and the server URL live in Android's
 * encrypted storage (expo-secure-store), never in plain AsyncStorage.
 */
import * as SecureStore from 'expo-secure-store';
import type { PendingAnswerRecord } from '@/lib/undo.js';

const SESSION_KEY = 'nod.session';
const SETTINGS_KEY = 'nod.settings';
const PENDING_KEY = 'nod.pending-answers';

export interface Session {
  serverUrl: string;
  token: string;
}

export type ThemeMode = 'system' | 'light' | 'dark';

export interface AppSettings {
  theme: ThemeMode;
  /** Post new decisions as a high-priority notification the RayNeo AI app
   *  mirrors to the lenses (see docs/design/mobile and the RayNeo iO route). */
  glassesMirror: boolean;
}

export const defaultSettings: AppSettings = { theme: 'system', glassesMirror: false };

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  await SecureStore.setItemAsync(key, JSON.stringify(value));
}

export function loadSession(): Promise<Session | null> {
  return readJson<Session | null>(SESSION_KEY, null);
}

export function saveSession(session: Session): Promise<void> {
  return writeJson(SESSION_KEY, session);
}

export function clearSession(): Promise<void> {
  return SecureStore.deleteItemAsync(SESSION_KEY);
}

export function loadSettings(): Promise<AppSettings> {
  return readJson<AppSettings>(SETTINGS_KEY, defaultSettings);
}

export function saveSettings(settings: AppSettings): Promise<void> {
  return writeJson(SETTINGS_KEY, settings);
}

export function loadPendingAnswers(): Promise<PendingAnswerRecord[]> {
  return readJson<PendingAnswerRecord[]>(PENDING_KEY, []);
}

export function savePendingAnswers(records: PendingAnswerRecord[]): Promise<void> {
  return writeJson(PENDING_KEY, records);
}
