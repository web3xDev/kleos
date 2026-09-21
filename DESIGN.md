# Kleos Design System

Direction: quiet infrastructure. Trustworthy, technical, premium. References: Linear, Stripe, Vercel. Avoid: crypto-casino aesthetics, neon gradients, glassmorphism, heavy shadows, anything "ancient Greece" (marble, gold, columns, laurels). Dark only for the MVP.

The one rule every element must pass: **can we actually prove this?** No invented data, no opaque score, no platform-owned history. Just evidence. If it cannot be proven from chain or verified in the browser, it is not shown (Claude Code as a "platform": no. OnchainRouter, proven via the stamp's payment: yes. "43 verified actions" from chain: yes. "1,842 reputation score": never).

## Tokens

Defined in `src/app/globals.css` and exposed to Tailwind as:

- Surfaces: `bg-background` `bg-surface` `bg-surface-hover` `bg-surface-elevated`
- Borders: `border-border` `border-border-subtle` `border-border-hover` (1px solid; depth comes from surface + border, not shadow)
- Text: `text-primary` `text-secondary` `text-tertiary` `text-disabled`
- Accent (interaction and primary CTAs only): `text-accent` `bg-accent` `bg-accent-hover` `bg-accent-muted`
- Semantic: `text-success` `bg-success-muted` `text-error` `bg-error-muted` `text-warning` `bg-warning-muted`. Green means verified / active / confirmed and nothing else.
- Fonts: Geist (`font-sans`), Geist Mono (`font-mono`) for every hash, id, address and amount.
- Radius: buttons and inputs 8px, cards and panels 10px, badges full. No `rounded-2xl` everywhere.
- Motion: 120ms fast, 180ms normal, 300ms emphasis. Animation explains a state change; nothing floats, glows or parallaxes.

## Type scale

Hero 64–72px / 600 / 0.95–1.0. Page heading 40px / 600 / 1.0. Section heading 24px / 600 / 1.15. Body 16px / 400 / 1.5. UI 14px / 500. Metadata 12px / 500 / uppercase (`.label`). Metrics 32px / 600 (`.metric`).

## Layout

Max width 1200px, centered, 32px side padding on desktop, 16px on mobile. 12-column desktop grid. Major sections 96–144px apart, normal sections 64–96px. Component spacing steps: 8, 12, 16, 24, 32, 48.

## Buttons

Primary: `bg-primary text-background` (white on black), hover pure white. Accent: only for a few key actions. Secondary: transparent with `border-border`. Ghost: no border, `text-secondary`, hover `text-primary bg-surface-hover`.

## Cards

`bg-surface border border-border rounded-[10px]`, hover `bg-surface-hover border-border-hover`. No shadow.

## Badges

`✓ Verified` (success text on success-muted), `● Active`, `Revoked` (error), `TESTNET` (always visible wherever a number is shown: `$0.43 USDC · TESTNET`).

## Identity, metrics, stamps

Agent ids and addresses in mono: `Agent #1842`, `0x7a3…91f`. Metrics are large but plain: number in `.metric`, label in `.label`. The stamp is the signature component: tool, platform, amount, time, `✓ Verified`; detail shows tool, amount, outcome, timestamp, settlement, signature, and the answer locked ("Owner only") or, in owner view, decrypted with "✓ Hash matches". A new stamp lands on the track record with a little weight (signed → anchored → verified).

## Verification UI

Real steps, not a spinner: "Reading from Monad ✓ / Checking settlements ✓ / Recomputing stamp hashes ✓ / Checking signatures ✓ / 43 / 43 stamps verified", then small but visible: "Verified in your browser against Monad. Not verified by a Kleos API."

## Empty and loading states

Empty states are part of the thesis, never hidden: "No track record yet. This agent has no verified actions. Pair a runtime to start one." Loading uses quiet skeletons (`#181818`, faint shimmer); long operations show their real steps instead.

## Navigation

Sticky 64px header, `rgba(10,10,10,0.85)` with light blur (not glass), bottom border `border-subtle`. Left: KLEOS. Center: Explore, Try it, Docs. Right: My agents, passkey icon (never initials or a name; there is none).

## Icons

Lucide, 1.5px stroke. 16px UI, 18px buttons, 20px nav, 24px feature states. No emoji.

## Page hierarchy

`/` hero → live real stats → example agent → how it works → recent stamps → CTA. `/me` your agents → cards → register. `/a/[id]` identity → metrics → platform/runtime → track record → verify. `/explore` "7,412 agents registered · 6 with track records" → search → filters → list. `/docs` clean, mostly text and code. `/try` the movie; a little more motion is allowed here. `/t/[id]` last.
