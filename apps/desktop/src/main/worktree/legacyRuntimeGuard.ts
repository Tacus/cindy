import { app } from 'electron';
import { CURRENT_EXECUTABLE_NAME } from '../../shared/brandRegion.js';

import { acquireWindowsPackagedInstanceBarrier } from '../windowsPackagedInstanceBarrier';

/**
 * Older Windows packaged builds have no instance/lease files. A dev process
 * sharing their profile must hold the existing Chromium startup barrier while
 * recycling. A packaged process already owns that profile's singleton itself.
 */
export async function withLegacyWorktreeRuntimeGuard<T>(task: (isHeld: () => boolean) => Promise<T>): Promise<T> {
  if (process.platform !== 'win32' || app.isPackaged !== false) return task(() => true);
  const lease = await acquireWindowsPackagedInstanceBarrier({
    userDataDir: app.getPath('userData'), programName: CURRENT_EXECUTABLE_NAME,
  });
  try { return await task(() => lease.isHeld()); } finally { await lease.release(); }
}
