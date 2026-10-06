"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { BookshelfProvider } from "./bookshelf";
import { api, ApiError } from "@/lib/api";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/types";
import { subscribeToChanges } from "@/lib/state-events";

const SessionContext = createContext<{
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
}>({ user: null, loading: true, refresh: async () => {} });
async function loadUser() {
  try {
    return await api<User>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  async function refresh() {
    const version = ++requestVersion.current;
    const next = await loadUser();
    if (version === requestVersion.current) {
      setUser(next);
      setLoading(false);
    }
  }
  useEffect(() => {
    const read = () => {
      const version = ++requestVersion.current;
      loadUser().then((user) => {
        if (version === requestVersion.current) {
          setUser(user);
          setLoading(false);
        }
      }).catch(() => {
        // A transport error is not evidence that an existing session ended.
        if (version === requestVersion.current) setLoading(false);
      });
    };
    read();
    const unsubscribe = subscribeToChanges(["session"], read);
    return () => {
      requestVersion.current += 1;
      unsubscribe();
    };
  }, []);
  useEffect(() => subscribeToChanges(["catalog"], () => router.refresh(), false), [router]);
  return (
    <SessionContext.Provider value={{ user, loading, refresh }}>
      <BookshelfProvider key={user?.id ?? "anonymous"} userId={user?.id ?? null}>{children}</BookshelfProvider>
    </SessionContext.Provider>
  );
}
export const useSession = () => useContext(SessionContext);
