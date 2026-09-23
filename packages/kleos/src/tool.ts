// The tool side of Kleos: countersign a paid call. A tool that already takes
// x402 payments adds one header to its response, and every stamp made for
// that call carries the tool's own "I was paid for this and served this".

import type { LocalAccount } from "viem";
import { toBytes, type Hex } from "viem";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import { bytesToHex, randomBytes } from "@noble/hashes/utils.js";
import {
  COUNTERSIGN_HEADER,
  answerCommitment,
  countersignDigest,
  encodeCountersign,
  type Countersign,
  type CountersignFields,
} from "./receipt.js";

type Eip3009 = { authorization?: { from: `0x${string}`; to: `0x${string}`; value: string; nonce: `0x${string}` } };

/** Read the x402 payment the buyer sent with this request (v2 or v1 header). */
export function readPayment(headers: Headers): { network: string; asset: `0x${string}`; auth: NonNullable<Eip3009["authorization"]> } | null {
  const raw = headers.get("payment-signature") ?? headers.get("x-payment");
  if (!raw) return null;
  try {
    const p = decodePaymentSignatureHeader(raw);
    const auth = (p.payload as Eip3009).authorization;
    if (!auth) return null;
    return { network: p.accepted.network, asset: p.accepted.asset as `0x${string}`, auth };
  } catch {
    return null;
  }
}

/**
 * Countersign one paid call. `account` must be the key behind `payTo`:
 * verifiers only accept a countersignature from the address that was paid.
 * Returns the header to set on the response, or null when the request
 * carried no EIP-3009 payment.
 */
export async function countersignPaidCall(input: {
  account: LocalAccount;
  headers: Headers;
  tool: string;
  answer: string;
}): Promise<{ name: string; value: string } | null> {
  const pay = readPayment(input.headers);
  if (!pay) return null;
  if (pay.auth.to.toLowerCase() !== input.account.address.toLowerCase()) {
    throw new Error("countersign key is not the payTo address");
  }
  const salt = `0x${bytesToHex(randomBytes(32))}` as Hex;
  const fields: CountersignFields = {
    v: 1,
    network: pay.network,
    tool: input.tool,
    payer: pay.auth.from,
    payTo: pay.auth.to,
    asset: pay.asset,
    amount: pay.auth.value,
    nonce: pay.auth.nonce,
    answerCommit: answerCommitment(input.answer, salt),
  };
  const signature = await input.account.signMessage({ message: { raw: toBytes(countersignDigest(fields)) } });
  const c: Countersign = { ...fields, signature, salt };
  return { name: COUNTERSIGN_HEADER, value: encodeCountersign(c) };
}
