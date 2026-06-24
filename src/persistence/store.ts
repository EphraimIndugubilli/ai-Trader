// src/persistence/store.ts
// File-based persistence: saves/restores portfolio state across restarts.

import fs from 'fs';
import path from 'path';
import { Position, ClosedTrade } from '../types/index';

const DATA_DIR  = path.join(process.cwd(), '.trader-data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

interface PersistedState {
  balance: number;
  positions: Position[];
  closedTrades: ClosedTrade[];
  equityHistory: number[];
  savedAt: string;
}

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function saveState(state: Omit<PersistedState, 'savedAt'>): void {
  try {
    ensureDir();
    const data: PersistedState = { ...state, savedAt: new Date().toISOString() };
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch (e) {
    console.warn('[persistence] Failed to save state:', (e as Error).message);
  }
}

export function loadState(): PersistedState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const data = JSON.parse(raw) as PersistedState;
    console.log(`[persistence] Restored state from ${data.savedAt}`);
    return data;
  } catch (e) {
    console.warn('[persistence] Failed to load state:', (e as Error).message);
    return null;
  }
}

export function clearState(): void {
  try {
    if (fs.existsSync(STATE_FILE)) fs.unlinkSync(STATE_FILE);
  } catch { /* ignore */ }
}
