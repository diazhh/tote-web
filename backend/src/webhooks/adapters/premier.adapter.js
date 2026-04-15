/**
 * Premier webhook adapter — active entry point.
 *
 * Re-exports from the validated draft implementation.
 * This file is the stable contract: webhook.service.js imports
 * `{slug}.adapter.js` by convention.
 *
 * The draft file (`premier.adapter.draft.js`) contains the full
 * implementation. This shim is the production entry point.
 */
export { normalize } from './premier.adapter.draft.js';
