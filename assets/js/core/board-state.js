function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
export class BoardState {
  constructor(items = []) { this.items = Array.isArray(items) ? items : []; }
  replace(items = []) { this.items = Array.isArray(items) ? items : []; return this.items; }
  snapshot() { return clone(this.items); }
  restore(snapshot = []) { return this.replace(snapshot); }
  find(id) { return this.items.find(item => item.id === id) || null; }
}
export function serializeBoardState(state, meta = {}) {
  const items = state instanceof BoardState ? state.snapshot() : clone(state?.items || []);
  return JSON.stringify({ version:1, savedAt:Date.now(), items, meta:{...meta} });
}
export function deserializeBoardState(raw) {
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed?.version !== 1 || !Array.isArray(parsed.items)) return null;
    return { items:clone(parsed.items), meta:{...(parsed.meta||{})}, savedAt:parsed.savedAt||null };
  } catch (_) { return null; }
}
export function saveBoardState(storage, key, state, meta = {}) {
  if (!storage?.setItem || !key) return false;
  try { storage.setItem(key, serializeBoardState(state,meta)); return true; } catch (_) { return false; }
}
export function loadBoardState(storage, key) {
  if (!storage?.getItem || !key) return null;
  try { return deserializeBoardState(storage.getItem(key)); } catch (_) { return null; }
}
