import { fileURLToPath } from 'node:url';
import path from 'node:path';
/** Same layout under src/core and dist/core; never resolved against caller cwd. */
export const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
export const packagePath = (...parts: string[]) => path.join(packageRoot, ...parts);
