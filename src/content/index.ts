/**
 * Content Script Entry Point — import-time side effect only.
 *
 * All logic lives in bootstrap.ts so tests can import it without triggering
 * initialization; this shim is the only file excluded from coverage.
 */

import { startContentScript } from './bootstrap';

startContentScript();
