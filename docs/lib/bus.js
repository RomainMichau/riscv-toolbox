// A tiny pub/sub so one card can hand something to another — the decoder
// sending a word to the encoder, say — without lifting every card's state up
// to App just for that one path.

const topics = new Map();

export function on(topic, fn) {
  const set = topics.get(topic) || new Set();
  set.add(fn);
  topics.set(topic, set);
  return () => set.delete(fn);
}

export function emit(topic, payload) {
  for (const fn of topics.get(topic) || []) fn(payload);
}
