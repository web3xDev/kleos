"use client";

// Mera PRF spike. Goal: prove that the same passkey reproduces the same owner
// address and the same per-agent encryption keys in a fresh browser profile,
// with nothing stored on this device.

import { useState } from "react";
import {
  createOwner,
  forgetCredential,
  hasStoredCredential,
  signInOwner,
  type SignInResult,
} from "@/lib/passkey";

type Step = { label: string; ms: number };

export default function SpikePage() {
  const [owner, setOwner] = useState<SignInResult | null>(null);
  const [agentKeys, setAgentKeys] = useState<{ id: string; publicKey: string }[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [prfSupported] = useState(() =>
    typeof window !== "undefined" && "PublicKeyCredential" in window,
  );

  async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    setSteps((s) => [...s, { label, ms: Math.round(performance.now() - start) }]);
    return result;
  }

  async function run(action: "create" | "signin") {
    setError(null);
    setSteps([]);
    setAgentKeys([]);
    try {
      const keys = await timed(
        action === "create" ? "create passkey, both salts" : "sign in, both salts",
        action === "create" ? createOwner : signInOwner,
      );
      setOwner(keys);
      setAgentKeys(
        [0, 1, 2].map((i) => ({
          id: `key index ${i}`,
          publicKey: keys.encryption.forIndex(i).publicKey,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
    }
  }

  function reset() {
    owner?.owner.session.end();
    setOwner(null);
    setAgentKeys([]);
    setSteps([]);
    forgetCredential();
  }

  return (
    <main className="mx-auto max-w-xl p-6 font-mono text-sm">
      <h1 className="text-lg font-bold">Kleos · Mera PRF spike</h1>
      <p className="mt-1 opacity-70">
        rpId: {typeof window !== "undefined" ? location.hostname : ""} · WebAuthn:{" "}
        {prfSupported ? "available" : "missing"} · stored credential:{" "}
        {typeof window !== "undefined" && hasStoredCredential() ? "yes" : "no"}
      </p>

      <div className="mt-4 flex gap-2">
        <button className="rounded border px-3 py-2" onClick={() => run("create")}>
          Create passkey
        </button>
        <button className="rounded border px-3 py-2" onClick={() => run("signin")}>
          Sign in
        </button>
        <button className="rounded border px-3 py-2 opacity-60" onClick={reset}>
          Forget local state
        </button>
      </div>

      {error && <pre className="mt-4 whitespace-pre-wrap text-red-600">{error}</pre>}

      {owner && (
        <section className="mt-6 space-y-3">
          <div>
            <div className="opacity-60">owner address (default salt)</div>
            <div className="break-all">{owner.owner.address}</div>
          </div>
          <div>
            <div className="opacity-60">credential id</div>
            <div className="break-all">{owner.credentialId}</div>
          </div>
          <div>
            <div className="opacity-60">passkey prompts this sign-in</div>
            <div>{owner.ceremonies} {owner.ceremonies === 1 ? "(both salts in one ceremony)" : "(fallback: second ceremony for the encryption salt)"}</div>
          </div>
          {agentKeys.map((k) => (
            <div key={k.id}>
              <div className="opacity-60">{k.id} encryption pubkey (kleos salt + hkdf)</div>
              <div className="break-all">{k.publicKey}</div>
            </div>
          ))}
        </section>
      )}

      {steps.length > 0 && (
        <ul className="mt-6 opacity-70">
          {steps.map((s) => (
            <li key={s.label}>
              {s.label}: {s.ms} ms
            </li>
          ))}
        </ul>
      )}

      <ol className="mt-8 list-decimal space-y-1 pl-5 opacity-70">
        <li>Safari. Click Create passkey, Touch ID. Note the owner address.</li>
        <li>Open a private window at the same URL, click Sign in, Touch ID.</li>
        <li>Same owner address and same agent pubkeys = the stateless test passes.</li>
        <li>Count the Touch ID prompts: the goal is one. The page says how many it took.</li>
      </ol>
    </main>
  );
}
