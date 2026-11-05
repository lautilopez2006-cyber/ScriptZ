// Local-build shim for @tauri-apps/* (the real packages are installed with npm on the user's machine).
const no = () => { throw new Error('Tauri API not available in this build'); };
export const invoke = no; export const open = no; export const save = no; export const readFile = no; export const readTextFile = no; export const writeFile = no; export const writeTextFile = no; export const openUrl = no;
