// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KleosStamps} from "../src/KleosStamps.sol";
import {KleosCredit, IKleosStamps} from "../src/KleosCredit.sol";
import {MockIdentity} from "./KleosStamps.t.sol";

contract KleosCreditTest is Test {
    MockIdentity identity;
    KleosStamps stamps;
    KleosCredit credit;

    uint256 runtimeKey = 0xB0B;
    address runtime;
    address owner = address(0xA11CE);
    address tool = address(0x7001);
    uint256 agentId = 1910;

    bytes32 invoiceId = keccak256("invoice-1");
    string toolId = "kleos-demo/monad-block";
    uint256 amount = 10_000;
    uint64 dueAt;

    function setUp() public {
        runtime = vm.addr(runtimeKey);
        identity = new MockIdentity();
        identity.set(agentId, owner, runtime);
        stamps = new KleosStamps(identity);
        credit = new KleosCredit(identity, IKleosStamps(address(stamps)));
        dueAt = uint64(block.timestamp + 5 minutes);
    }

    function _consent(uint256 key, address creditor, uint256 amt, uint64 due, bytes32 id) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(credit.CREDIT_REQUEST_TYPEHASH(), agentId, creditor, amt, due, id, keccak256(bytes(toolId)))
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", credit.domainSeparator(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _open() internal {
        bytes memory sig = _consent(runtimeKey, tool, amount, dueAt, invoiceId);
        vm.prank(tool);
        credit.open(agentId, amount, dueAt, invoiceId, toolId, sig);
    }

    function _stamp(bytes32 receipt, uint256 amt) internal {
        vm.prank(runtime);
        stamps.stamp(agentId, receipt, keccak256(abi.encode(receipt)), toolId, "kleos-demo", amt);
    }

    function test_openWithAgentConsent() public {
        _open();
        KleosCredit.Invoice memory inv = credit.getInvoice(invoiceId);
        assertEq(inv.agentId, agentId);
        assertEq(inv.creditor, tool);
        assertEq(inv.amount, amount);
        assertEq(inv.dueAt, dueAt);
        assertEq(inv.paidAt, 0);
        assertEq(credit.invoicesOf(agentId).length, 1);
    }

    function test_toolCannotInventDebt() public {
        // Signed by some other key, not the agent's wallet.
        bytes memory sig = _consent(0xBAD, tool, amount, dueAt, invoiceId);
        vm.prank(tool);
        vm.expectRevert(KleosCredit.NotAgentConsent.selector);
        credit.open(agentId, amount, dueAt, invoiceId, toolId, sig);
    }

    function test_consentIsBoundToCreditorAndAmount() public {
        bytes memory sig = _consent(runtimeKey, tool, amount, dueAt, invoiceId);
        // Another address replaying the consent is not the creditor the agent agreed to.
        vm.prank(address(0xE7E));
        vm.expectRevert(KleosCredit.NotAgentConsent.selector);
        credit.open(agentId, amount, dueAt, invoiceId, toolId, sig);
        // The creditor cannot inflate the amount.
        vm.prank(tool);
        vm.expectRevert(KleosCredit.NotAgentConsent.selector);
        credit.open(agentId, amount * 10, dueAt, invoiceId, toolId, sig);
    }

    function test_noCreditWithoutAgentWallet() public {
        identity.set(agentId, owner, address(0));
        bytes memory sig = _consent(runtimeKey, tool, amount, dueAt, invoiceId);
        vm.prank(tool);
        vm.expectRevert(abi.encodeWithSelector(KleosCredit.NoAgentWallet.selector, agentId));
        credit.open(agentId, amount, dueAt, invoiceId, toolId, sig);
    }

    function test_duplicateInvoiceRejected() public {
        _open();
        bytes memory sig = _consent(runtimeKey, tool, amount, dueAt, invoiceId);
        vm.prank(tool);
        vm.expectRevert(abi.encodeWithSelector(KleosCredit.InvoiceExists.selector, invoiceId));
        credit.open(agentId, amount, dueAt, invoiceId, toolId, sig);
    }

    function test_paidByMatchingStamp() public {
        _open();
        bytes32 receipt = keccak256("receipt-1");
        _stamp(receipt, amount);
        credit.pay(invoiceId, receipt);
        KleosCredit.Invoice memory inv = credit.getInvoice(invoiceId);
        assertGt(inv.paidAt, 0);
        assertEq(inv.receiptHash, receipt);
        assertTrue(credit.receiptUsed(receipt));
    }

    function test_unpaidStaysOpenPastDue() public {
        _open();
        vm.warp(dueAt + 1 days);
        KleosCredit.Invoice memory inv = credit.getInvoice(invoiceId);
        assertEq(inv.paidAt, 0);
        assertLt(inv.dueAt, block.timestamp);
    }

    function test_latePaymentStillCloses() public {
        _open();
        vm.warp(dueAt + 1 hours);
        bytes32 receipt = keccak256("late");
        _stamp(receipt, amount);
        credit.pay(invoiceId, receipt);
        assertGt(credit.getInvoice(invoiceId).paidAt, dueAt);
    }

    function test_cannotPayWithSmallerStamp() public {
        _open();
        bytes32 receipt = keccak256("small");
        _stamp(receipt, amount - 1);
        vm.expectRevert(abi.encodeWithSelector(KleosCredit.StampDoesNotPay.selector, receipt));
        credit.pay(invoiceId, receipt);
    }

    function test_cannotPayWithOlderStamp() public {
        bytes32 receipt = keccak256("before");
        _stamp(receipt, amount);
        vm.warp(block.timestamp + 1);
        _open();
        vm.expectRevert(abi.encodeWithSelector(KleosCredit.StampDoesNotPay.selector, receipt));
        credit.pay(invoiceId, receipt);
    }

    function test_cannotPayWithUnknownStamp() public {
        _open();
        bytes32 receipt = keccak256("nothing");
        vm.expectRevert(abi.encodeWithSelector(KleosCredit.StampDoesNotPay.selector, receipt));
        credit.pay(invoiceId, receipt);
    }

    function test_oneReceiptPaysOneInvoice() public {
        _open();
        bytes32 second = keccak256("invoice-2");
        bytes memory sig = _consent(runtimeKey, tool, amount, dueAt, second);
        vm.prank(tool);
        credit.open(agentId, amount, dueAt, second, toolId, sig);

        bytes32 receipt = keccak256("receipt-1");
        _stamp(receipt, amount);
        credit.pay(invoiceId, receipt);
        vm.expectRevert(abi.encodeWithSelector(KleosCredit.ReceiptAlreadyUsed.selector, receipt));
        credit.pay(second, receipt);
    }

    function test_cannotPayTwice() public {
        _open();
        bytes32 receipt = keccak256("receipt-1");
        _stamp(receipt, amount);
        credit.pay(invoiceId, receipt);
        bytes32 again = keccak256("receipt-2");
        _stamp(again, amount);
        vm.expectRevert(abi.encodeWithSelector(KleosCredit.AlreadyPaid.selector, invoiceId));
        credit.pay(invoiceId, again);
    }
}
