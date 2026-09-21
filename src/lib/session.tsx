"use client";

// Owner session: the keys derived from the passkey live here, in memory, for
// a bounded time. Reads never prompt; the session ends by timer or by hand,
// and ending it zeroes the signing key. Nothing here is persisted.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toViemAccount } from "@category-labs/mera/viem";
import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { chain } from "./chain";
import { createOwner, signInOwner, type SignInResult } from "./passkey";
import { useToast } from "@/components/toast";

export const SESSION_MINUTES = 15;

// Non-secret marker: "a session existed in this tab". Lets a reload explain
// that the session ended instead of showing the first-visit screen. No key
// material is ever stored.
const HAD_SESSION = "kleos.hadSession";

export function hadSession(): boolean {
  try {
    return sessionStorage.getItem(HAD_SESSION) === "1";
  } catch {
    return false;
  }
}

type Session = {
  keys: SignInResult;
  address: `0x${string}`;
  wallet: WalletClient;
  endsAt: number;
};

type SessionContextValue = {
  session: Session | null;
  publicClient: PublicClient;
  busy: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  create: () => Promise<void>;
  end: () => void;
  secondsLeft: number;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const publicClient = useMemo(() => createPublicClient({ chain, transport: http() }), []);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const sessionRef = useRef<Session | null>(null);
  const { notify } = useToast();

  const end = useCallback(() => {
    sessionRef.current?.keys.owner.session.end();
    sessionRef.current = null;
    setSession(null);
  }, []);

  const start = useCallback(
    async (fn: () => Promise<SignInResult>) => {
      setBusy(true);
      setError(null);
      try {
        end();
        const keys = await fn();
        const account = toViemAccount(keys.owner.session);
        const wallet = createWalletClient({ account, chain, transport: http() });
        const next: Session = {
          keys,
          address: account.address,
          wallet,
          endsAt: Date.now() + SESSION_MINUTES * 60_000,
        };
        sessionRef.current = next;
        setSession(next);
        try {
          sessionStorage.setItem(HAD_SESSION, "1");
        } catch {
          // untrusted storage
        }
        notify(
          `Signed in for ${SESSION_MINUTES} minutes`,
          "Your keys live only in memory. Reloading the page ends the session; your passkey brings it straight back.",
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [end, notify],
  );

  const signIn = useCallback(() => start(signInOwner), [start]);
  const create = useCallback(() => start(createOwner), [start]);

  // Session clock. Expiry ends the session, which zeroes the key.
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      if (sessionRef.current && Date.now() >= sessionRef.current.endsAt) end();
    }, 1000);
    return () => clearInterval(t);
  }, [end]);

  const secondsLeft = session ? Math.max(0, Math.round((session.endsAt - now) / 1000)) : 0;

  const value = useMemo(
    () => ({ session, publicClient, busy, error, signIn, create, end, secondsLeft }),
    [session, publicClient, busy, error, signIn, create, end, secondsLeft],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
