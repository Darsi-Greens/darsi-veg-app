// Client-generated document IDs for idempotent Firestore writes.
//
// Why: every local-first save is "write to Firestore; on failure queue a retry".
// If the network drops AFTER the write commits but BEFORE the ack, the retry
// would create a DUPLICATE with addDoc(). By generating the doc ID on the
// client and using setDoc(doc(col, id)), a retry overwrites the same document
// instead of creating a new one — so sales/orders are never double-counted.

let counter = 0;

export function newId() {
  // time component keeps IDs roughly sortable; counter avoids collisions inside
  // the same millisecond; random tail avoids cross-device collisions.
  counter = (counter + 1) % 4096;
  const time = Date.now().toString(36);
  const seq  = counter.toString(36).padStart(3, '0');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${time}${seq}${rand}`;
}
