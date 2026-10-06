"use client";

type Change = "session" | "bookshelf" | "catalog";
const channelName = "margin-state-changes";
let sharedChannel: BroadcastChannel | null = null;
let subscribers = 0;

function getChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  return sharedChannel ??= new BroadcastChannel(channelName);
}

// Only invalidation signals cross tabs; never send user data or credentials.
export function announceChange(change: Change) {
  const channel = getChannel();
  if (!channel) return;
  channel.postMessage(change);
  // Reusing the subscriber's channel excludes this tab from its own message.
  if (!subscribers) { channel.close(); sharedChannel = null; }
}

export function subscribeToChanges(changes: readonly Change[], refresh: () => void, onResume = true) {
  const channel = getChannel();
  const receive = (event: MessageEvent<unknown>) => {
    if (changes.some((change) => change === event.data)) refresh();
  };
  if (channel) { subscribers += 1; channel.addEventListener("message", receive); }
  const resume = () => { if (document.visibilityState === "visible") refresh(); };
  const restore = (event: PageTransitionEvent) => { if (event.persisted) resume(); };
  if (onResume) {
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pageshow", restore);
  }
  return () => {
    if (channel) {
      channel.removeEventListener("message", receive);
      subscribers -= 1;
      if (!subscribers) { channel.close(); sharedChannel = null; }
    }
    window.removeEventListener("focus", resume);
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("pageshow", restore);
  };
}
