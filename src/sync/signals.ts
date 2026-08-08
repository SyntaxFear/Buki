type QueueListener = () => void;

const listeners = new Set<QueueListener>();

export function notifySyncQueueChanged(): void {
  for (const listener of listeners) listener();
}

export function subscribeToSyncQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
