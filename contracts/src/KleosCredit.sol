// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {IIdentityRegistry} from "./KleosStamps.sol";

/// @dev The part of KleosStamps that KleosCredit reads to close an invoice.
interface IKleosStamps {
    struct Stamp {
        uint256 agentId;
        bytes32 settlementTx;
        uint256 amount;
        address wallet;
        uint64 timestamp;
    }

    function getStamp(bytes32 receiptHash) external view returns (Stamp memory);
}

/// @title KleosCredit
/// @notice The other half of a payment history: work served before payment.
///
/// A tool that trusts an agent's record can serve it first and get paid after.
/// That credit is recorded here as an invoice, so it counts either way: paid
/// invoices close against a stamp, unpaid ones stay open past their due date
/// for anyone to see.
///
/// Neither side can write the other's history alone:
/// - An invoice opens only with the agent's signed consent (EIP-712, signed by
///   the agent's ERC-8004 `agentWallet`), so a tool cannot invent debt.
/// - The tool that opens it is the creditor (`msg.sender`), so an agent cannot
///   hide debt it signed for.
/// - It closes only against a KleosStamps receipt for the same agent, of at
///   least the invoiced amount, anchored after the invoice opened. Each receipt
///   can pay one invoice.
contract KleosCredit {
    IIdentityRegistry public immutable identity;
    IKleosStamps public immutable stamps;

    struct Invoice {
        uint256 agentId;
        address creditor; // the tool; payments for this invoice go to this address
        uint256 amount; // asset atomic units
        uint64 openedAt;
        uint64 dueAt;
        uint64 paidAt; // 0 while unpaid
        bytes32 receiptHash; // the stamp that paid it
        string tool;
    }

    bytes32 public constant CREDIT_REQUEST_TYPEHASH = keccak256(
        "CreditRequest(uint256 agentId,address creditor,uint256 amount,uint64 dueAt,bytes32 invoiceId,string tool)"
    );
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    mapping(bytes32 => Invoice) private _invoices;
    mapping(uint256 => bytes32[]) private _agentInvoices;
    mapping(bytes32 => bool) public receiptUsed;

    event InvoiceOpened(
        bytes32 indexed invoiceId, uint256 indexed agentId, address indexed creditor, uint256 amount, uint64 dueAt, string tool
    );
    event InvoicePaid(bytes32 indexed invoiceId, uint256 indexed agentId, bytes32 receiptHash, uint64 paidAt);

    error InvoiceExists(bytes32 invoiceId);
    error DueInPast();
    error NoAgentWallet(uint256 agentId);
    error NotAgentConsent();
    error UnknownInvoice(bytes32 invoiceId);
    error AlreadyPaid(bytes32 invoiceId);
    error ReceiptAlreadyUsed(bytes32 receiptHash);
    error StampDoesNotPay(bytes32 receiptHash);

    constructor(IIdentityRegistry identity_, IKleosStamps stamps_) {
        identity = identity_;
        stamps = stamps_;
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(
            abi.encode(DOMAIN_TYPEHASH, keccak256("KleosCredit"), keccak256("1"), block.chainid, address(this))
        );
    }

    /// @notice Record credit a tool has extended. Called by the tool (creditor).
    /// @param agentSig the agent's EIP-712 CreditRequest signature, from its agentWallet.
    function open(
        uint256 agentId,
        uint256 amount,
        uint64 dueAt,
        bytes32 invoiceId,
        string calldata tool,
        bytes calldata agentSig
    ) external {
        if (_invoices[invoiceId].openedAt != 0) revert InvoiceExists(invoiceId);
        if (dueAt <= block.timestamp) revert DueInPast();
        address wallet = identity.getAgentWallet(agentId);
        if (wallet == address(0)) revert NoAgentWallet(agentId);

        bytes32 structHash = keccak256(
            abi.encode(CREDIT_REQUEST_TYPEHASH, agentId, msg.sender, amount, dueAt, invoiceId, keccak256(bytes(tool)))
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
        if (_recover(digest, agentSig) != wallet) revert NotAgentConsent();

        _invoices[invoiceId] = Invoice({
            agentId: agentId,
            creditor: msg.sender,
            amount: amount,
            openedAt: uint64(block.timestamp),
            dueAt: dueAt,
            paidAt: 0,
            receiptHash: bytes32(0),
            tool: tool
        });
        _agentInvoices[agentId].push(invoiceId);
        emit InvoiceOpened(invoiceId, agentId, msg.sender, amount, dueAt, tool);
    }

    /// @notice Close an invoice with the stamp of the payment that settled it.
    /// Anyone may call it; the stamp is the proof.
    function pay(bytes32 invoiceId, bytes32 receiptHash) external {
        Invoice storage inv = _invoices[invoiceId];
        if (inv.openedAt == 0) revert UnknownInvoice(invoiceId);
        if (inv.paidAt != 0) revert AlreadyPaid(invoiceId);
        if (receiptUsed[receiptHash]) revert ReceiptAlreadyUsed(receiptHash);

        IKleosStamps.Stamp memory s = stamps.getStamp(receiptHash);
        if (s.timestamp == 0 || s.agentId != inv.agentId || s.amount < inv.amount || s.timestamp < inv.openedAt) {
            revert StampDoesNotPay(receiptHash);
        }

        receiptUsed[receiptHash] = true;
        inv.paidAt = uint64(block.timestamp);
        inv.receiptHash = receiptHash;
        emit InvoicePaid(invoiceId, inv.agentId, receiptHash, uint64(block.timestamp));
    }

    function getInvoice(bytes32 invoiceId) external view returns (Invoice memory) {
        return _invoices[invoiceId];
    }

    /// @notice Every invoice ever opened for an agent, oldest first.
    function invoicesOf(uint256 agentId) external view returns (bytes32[] memory) {
        return _agentInvoices[agentId];
    }

    /// @dev ECDSA recovery for a 65-byte signature, rejecting malleable (high-s) forms.
    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
