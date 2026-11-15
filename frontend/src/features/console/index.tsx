// Public surface of the ground mission-control console (#/yer).
// main.tsx lazy-loads GroundConsoleApp; the HUD should import
// GroundConsoleLink from './GroundConsoleLink' directly (keeps the chunk split).
export { GroundConsoleApp } from './GroundConsoleApp';
export { GROUND_CONSOLE_HASH, GroundConsoleLink, type GroundConsoleLinkProps } from './GroundConsoleLink';
