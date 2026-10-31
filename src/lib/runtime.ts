/**
 * Syncing with Delta needs the API key and the IP it is whitelisted to, so it
 * runs on your PC (the bot or the local app), never on the hosted app.
 */
export const canSyncHere = () => !process.env.VERCEL;

export const SYNC_ELSEWHERE = "Syncing runs on your PC (npm run bot), because your Delta key is whitelisted to its IP.";
