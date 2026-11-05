// Two copies of the app are published from one codebase:
//  - the main app (clean slate, for real use), and
//  - a practice copy at /sample/ preloaded with fake clients (VITE_SPACE=sample).
// They keep separate on-device storage so practicing never touches real data.
export const IS_SAMPLE = import.meta.env.VITE_SPACE === 'sample';
