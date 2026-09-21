// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev The subset of the ERC-8004 Identity Registry that Kleos reads.
interface IIdentityRegistry {
    function ownerOf(uint256 agentId) external view returns (address);
    function getAgentWallet(uint256 agentId) external view returns (address);
}

/// @title KleosStamps
/// @notice On-chain anchors for stamps: one record per paid agent action.
///
/// A stamp exists only when a payment settled. The runtime that holds the
/// agent's ERC-8004 `agentWallet` anchors the hash of the signed receipt next
/// to the settlement transaction. Authorization is delegated entirely to the
/// Identity Registry: whoever the owner set as `agentWallet` may stamp, and
/// `unsetAgentWallet` revokes that without touching this contract. Existing
/// stamps stay verifiable after a revoke; only new ones stop.
contract KleosStamps {
    IIdentityRegistry public immutable identity;

    struct Stamp {
        uint256 agentId;
        bytes32 settlementTx;
        uint256 amount; // asset atomic units (USDC has 6 decimals)
        address wallet; // agentWallet at the time of stamping
        uint64 timestamp;
    }

    /// @dev receiptHash => stamp. The receipt itself lives off-chain
    /// (encrypted to the owner); its hash is what anyone can verify.
    mapping(bytes32 => Stamp) private _stamps;
    mapping(uint256 => uint64) public stampCount;

    event Stamped(
        uint256 indexed agentId,
        bytes32 indexed receiptHash,
        bytes32 settlementTx,
        bytes32 indexed toolId,
        string tool,
        string platform,
        uint256 amount,
        address wallet,
        uint64 timestamp
    );

    error NotAgentWallet(uint256 agentId, address caller);
    error AlreadyStamped(bytes32 receiptHash);
    error NoSettlement();

    constructor(IIdentityRegistry identity_) {
        identity = identity_;
    }

    /// @notice Anchor one paid action.
    /// @param agentId ERC-8004 agent id.
    /// @param receiptHash keccak256 of the canonical signed receipt.
    /// @param settlementTx hash of the x402 settlement transaction.
    /// @param tool human-readable tool identifier (e.g. an x402 resource URL).
    /// @param platform where the tool was bought (e.g. "onchainrouter").
    /// @param amount amount paid, in the asset's atomic units.
    function stamp(
        uint256 agentId,
        bytes32 receiptHash,
        bytes32 settlementTx,
        string calldata tool,
        string calldata platform,
        uint256 amount
    ) external {
        if (msg.sender != identity.getAgentWallet(agentId)) revert NotAgentWallet(agentId, msg.sender);
        if (settlementTx == bytes32(0)) revert NoSettlement();
        if (_stamps[receiptHash].timestamp != 0) revert AlreadyStamped(receiptHash);

        _stamps[receiptHash] = Stamp({
            agentId: agentId,
            settlementTx: settlementTx,
            amount: amount,
            wallet: msg.sender,
            timestamp: uint64(block.timestamp)
        });
        stampCount[agentId] += 1;

        emit Stamped(
            agentId,
            receiptHash,
            settlementTx,
            keccak256(bytes(tool)),
            tool,
            platform,
            amount,
            msg.sender,
            uint64(block.timestamp)
        );
    }

    /// @notice Look up a stamp by receipt hash. `timestamp == 0` means none.
    function getStamp(bytes32 receiptHash) external view returns (Stamp memory) {
        return _stamps[receiptHash];
    }

    /// @notice True when the receipt hash was anchored for this agent.
    function isStamped(uint256 agentId, bytes32 receiptHash) external view returns (bool) {
        Stamp storage s = _stamps[receiptHash];
        return s.timestamp != 0 && s.agentId == agentId;
    }
}
