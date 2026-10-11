// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
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
///   the agent's ERC-8004 `agentWallet`, an EOA or an ERC-1271 contract
///   wallet), so a tool cannot invent debt.
/// - The tool that opens it is the creditor (`msg.sender`), so an agent cannot
///   hide debt it signed for.
/// - It closes only with both halves of the payment: a KleosStamps receipt for
///   the same agent, of at least the invoiced amount, anchored after the
///   invoice opened; and the creditor's signed acknowledgement that it was paid
///   for this invoice. The stamp keeps the record; the acknowledgement stops an
///   agent from closing an invoice with a payment that went somewhere else.
///   Each receipt can pay one invoice.
contract KleosCredit is EIP712 {
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
    /// The creditor's "I was paid for this invoice", signed when its payment arrives.
    bytes32 public constant PAYMENT_RECEIVED_TYPEHASH = keccak256("PaymentReceived(bytes32 invoiceId,uint256 amount)");

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
    error NotCreditorAcknowledgement();

    constructor(IIdentityRegistry identity_, IKleosStamps stamps_) EIP712("KleosCredit", "2") {
        identity = identity_;
        stamps = stamps_;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
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
        // EOA (ECDSA, low-s only) or contract wallet (ERC-1271): ERC-8004 allows both as agentWallet.
        if (!SignatureChecker.isValidSignatureNow(wallet, _hashTypedDataV4(structHash), agentSig)) revert NotAgentConsent();

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
    /// Anyone may call it; the stamp and the creditor's acknowledgement are the proof.
    /// @param creditorSig the creditor's EIP-712 PaymentReceived(invoiceId, amount) signature.
    function pay(bytes32 invoiceId, bytes32 receiptHash, bytes calldata creditorSig) external {
        Invoice storage inv = _invoices[invoiceId];
        if (inv.openedAt == 0) revert UnknownInvoice(invoiceId);
        if (inv.paidAt != 0) revert AlreadyPaid(invoiceId);
        if (receiptUsed[receiptHash]) revert ReceiptAlreadyUsed(receiptHash);

        IKleosStamps.Stamp memory s = stamps.getStamp(receiptHash);
        if (s.timestamp == 0 || s.agentId != inv.agentId || s.amount < inv.amount || s.timestamp < inv.openedAt) {
            revert StampDoesNotPay(receiptHash);
        }
        bytes32 ack = _hashTypedDataV4(keccak256(abi.encode(PAYMENT_RECEIVED_TYPEHASH, invoiceId, inv.amount)));
        if (!SignatureChecker.isValidSignatureNow(inv.creditor, ack, creditorSig)) revert NotCreditorAcknowledgement();

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
}
