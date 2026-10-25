type Sender = (data: string) => void;

const hub = new Map<string, Set<Sender>>();

export function subscribeToBoard(boardId: string, send: Sender): () => void {
  let subs = hub.get(boardId);
  if (!subs) {
    subs = new Set();
    hub.set(boardId, subs);
  }
  subs.add(send);
  return () => {
    subs!.delete(send);
    if (subs!.size === 0) hub.delete(boardId);
  };
}

export function broadcastBoardUpdate(boardId: string): void {
  const subs = hub.get(boardId);
  if (!subs || subs.size === 0) return;
  const msg = 'event: update\ndata: \n\n';
  for (const send of subs) {
    try { send(msg); } catch {}
  }
}
