import { invoke } from '@tauri-apps/api/core';
import type { RenameLogEntry } from './types';

export async function getDataRoot(): Promise<string> {
  return invoke<string>('get_data_root');
}

export async function writeRenameLog(entries: RenameLogEntry[]): Promise<string> {
  return invoke<string>('write_rename_log', { entries });
}

export async function readLastRunEntries(): Promise<RenameLogEntry[]> {
  return invoke<RenameLogEntry[]>('read_last_run_entries');
}

