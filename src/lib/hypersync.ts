// The ERC-8004 registry and KleosStamps on Monad testnet, read through Envio
// HyperSync: every Registered / URIUpdated / MetadataSet / Transfer event of
// the registry and every Stamped event of KleosStamps, from genesis, in a
// handful of paged queries, replayed in chain order. The same logic as the
// HyperIndex handlers in indexer/, without a hosted indexer in between.
//
// Needs ENVIO_API_TOKEN (a HyperSync token from envio.dev). Server only.

import { decodeEventLog, getAddress, keccak256, parseAbi, toBytes, toEventSelector, type Hex } from "viem";
import { addresses } from "./chain";
import { parseRegistration } from "./erc8004";
import type { ExploreAgent, ExploreData } from "./registry-scan";

const URL = "https://monad-testnet.hypersync.xyz/query";
const ZERO = "0x0000000000000000000000000000000000000000";

const abi = parseAbi([
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
  "event URIUpdated(uint256 indexed agentId, string newURI, address indexed updatedBy)",
  "event MetadataSet(uint256 indexed agentId, string indexed indexedMetadataKey, string metadataKey, bytes metadataValue)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Stamped(uint256 indexed agentId, bytes32 indexed receiptHash, bytes32 settlementTx, bytes32 indexed toolId, string tool, string platform, uint256 amount, address wallet, uint64 timestamp)",
]);
const sig = (name: string) => toEventSelector(abi.find((e) => e.name === name)!);
// Only the two metadata keys Kleos reads; the indexed key is its keccak256.
const META_KEYS = ["agentWallet", "kleos.encryptionKey"].map((k) => keccak256(toBytes(k)));

type RawLog = {
  block_number: number;
  log_index: number;
  address: string;
  data: Hex;
  topic0: Hex | null;
  topic1: Hex | null;
  topic2: Hex | null;
  topic3: Hex | null;
};

type Agent = { id: number; owner: string; uri: string; wallet: string | null; kleos: boolean; stamps: number };

/** All matching logs from genesis to the chain head, paged by next_block. */
async function fetchLogs(token: string): Promise<RawLog[]> {
  const logs: RawLog[] = [];
  let fromBlock = 0;
  for (let page = 0; page < 200; page++) {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        from_block: fromBlock,
        logs: [
          {
            address: [addresses.identityRegistry],
            topics: [[sig("Registered"), sig("URIUpdated"), sig("Transfer")]],
          },
          { address: [addresses.identityRegistry], topics: [[sig("MetadataSet")], [], META_KEYS] },
          { address: [addresses.kleosStamps], topics: [[sig("Stamped")]] },
        ],
        field_selection: {
          log: ["block_number", "log_index", "address", "data", "topic0", "topic1", "topic2", "topic3"],
        },
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`hypersync ${res.status}: ${(await res.text()).slice(0, 120)}`);
    const body = (await res.json()) as {
      data?: { logs?: RawLog[] }[] | { logs?: RawLog[] };
      next_block?: number;
      archive_height?: number | null;
    };
    // `data` comes as a list of batches; accept a single batch too.
    const batches = Array.isArray(body.data) ? body.data : body.data ? [body.data] : [];
    for (const b of batches) logs.push(...(b.logs ?? []));

    const next = body.next_block ?? fromBlock;
    const head = body.archive_height ?? next;
    if (next <= fromBlock || next >= head) break;
    fromBlock = next;
  }
  return logs;
}

/** Every agent with its Kleos stamp count, as the chain's events say. */
export async function fromHyperSync(token: string): Promise<ExploreData> {
  const logs = await fetchLogs(token);
  logs.sort((a, b) => a.block_number - b.block_number || a.log_index - b.log_index);

  const agents = new Map<number, Agent>();
  const get = (id: number) => {
    let a = agents.get(id);
    if (!a) agents.set(id, (a = { id, owner: ZERO, uri: "", wallet: null, kleos: false, stamps: 0 }));
    return a;
  };

  for (const l of logs) {
    const topics = [l.topic0, l.topic1, l.topic2, l.topic3].filter((t): t is Hex => Boolean(t)) as [Hex, ...Hex[]];
    let ev;
    try {
      ev = decodeEventLog({ abi, data: l.data ?? "0x", topics });
    } catch {
      continue; // not one of ours
    }
    const isStamps = l.address.toLowerCase() === addresses.kleosStamps.toLowerCase();
    switch (ev.eventName) {
      case "Registered": {
        const a = get(Number(ev.args.agentId));
        a.owner = ev.args.owner.toLowerCase();
        a.uri = ev.args.agentURI;
        break;
      }
      case "URIUpdated":
        get(Number(ev.args.agentId)).uri = ev.args.newURI;
        break;
      case "MetadataSet": {
        const a = get(Number(ev.args.agentId));
        const value = ev.args.metadataValue.toLowerCase();
        if (ev.args.metadataKey === "agentWallet") a.wallet = value.length === 42 ? value : null;
        else if (ev.args.metadataKey === "kleos.encryptionKey") a.kleos = value !== "0x";
        break;
      }
      case "Transfer": {
        const id = Number(ev.args.tokenId);
        if (ev.args.to.toLowerCase() === ZERO) agents.delete(id); // burned
        else if (ev.args.from.toLowerCase() !== ZERO) {
          // ERC-8004 clears agentWallet on transfer; the new owner has to pair a runtime again.
          const a = get(id);
          a.owner = ev.args.to.toLowerCase();
          a.wallet = null;
        }
        break;
      }
      case "Stamped":
        if (isStamps) get(Number(ev.args.agentId)).stamps += 1;
        break;
    }
  }

  const list: ExploreAgent[] = [...agents.values()]
    .filter((a) => a.owner !== ZERO)
    .sort((a, b) => a.id - b.id)
    .map((a) => ({
      id: a.id,
      name: parseRegistration(a.uri)?.name ?? null,
      owner: getAddress(a.owner),
      // A wallet equal to the owner is not a runtime (the registry sets it at mint).
      wallet: a.wallet && a.wallet !== a.owner ? getAddress(a.wallet) : null,
      stamps: a.stamps,
      kleos: a.kleos,
    }));
  if (list.length === 0) throw new Error("hypersync: no agents in the response");

  return {
    total: list.length,
    withTrackRecord: list.filter((a) => a.stamps > 0).length,
    totalStamps: list.reduce((s, a) => s + a.stamps, 0),
    agents: list,
    scannedAt: Date.now(),
  };
}
