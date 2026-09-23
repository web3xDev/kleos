// The fifth check: did the tool countersign this stamp? Browser-safe, used by
// the profile, the landing card and the public verify API alike.
//
// A v2 receipt carries the tool's signature over (payer, payTo, asset, amount,
// payment nonce, tool, answer commitment). It counts only if
//   1. it was signed by payTo, the address that received the payment, and
//   2. the settlement tx really used that nonce (AuthorizationUsed) and moved
//      that amount from the payer to payTo (Transfer).
// v1 receipts predate countersigning: the check is "not applicable", not failed.

import { isAddressEqual, keccak256, pad, toBytes, type PublicClient, type TransactionReceipt } from "viem";
import { countersigner, countersignFieldsOf, type ReceiptPublic } from "kleos/receipt";

const AUTHORIZATION_USED = keccak256(toBytes("AuthorizationUsed(address,bytes32)"));
const TRANSFER = keccak256(toBytes("Transfer(address,address,uint256)"));

export type CountersignCheck = { ok: boolean | null; signer?: `0x${string}`; detail: string };

export async function checkCountersign(
  publicClient: PublicClient,
  pub: ReceiptPublic,
  settlement?: TransactionReceipt | null,
): Promise<CountersignCheck> {
  if (pub.v !== 2) return { ok: null, detail: "not countersigned (made before countersigning)" };

  let signer: `0x${string}`;
  try {
    signer = await countersigner(countersignFieldsOf(pub), pub.toolSignature);
  } catch {
    return { ok: false, detail: "countersignature does not recover" };
  }
  if (!isAddressEqual(signer, pub.payTo)) return { ok: false, signer, detail: "not signed by the paid address" };

  const tx = settlement ?? (await publicClient.getTransactionReceipt({ hash: pub.settlementTx }).catch(() => null));
  if (!tx) return { ok: false, signer, detail: "settlement not found" };
  const onAsset = tx.logs.filter((l) => isAddressEqual(l.address, pub.asset));
  const payer = pad(pub.wallet.toLowerCase() as `0x${string}`).toLowerCase();
  const payTo = pad(pub.payTo.toLowerCase() as `0x${string}`).toLowerCase();
  const nonceUsed = onAsset.some(
    (l) => l.topics[0] === AUTHORIZATION_USED && l.topics[1]?.toLowerCase() === payer && l.topics[2]?.toLowerCase() === pub.paymentNonce.toLowerCase(),
  );
  const paid = onAsset.some(
    (l) =>
      l.topics[0] === TRANSFER &&
      l.topics[1]?.toLowerCase() === payer &&
      l.topics[2]?.toLowerCase() === payTo &&
      BigInt(l.data) === BigInt(pub.amount),
  );
  if (!nonceUsed) return { ok: false, signer, detail: "payment nonce not in the settlement" };
  if (!paid) return { ok: false, signer, detail: "settlement did not pay the countersigner" };
  return { ok: true, signer, detail: `countersigned by ${signer}` };
}
