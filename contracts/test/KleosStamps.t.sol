// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KleosStamps, IIdentityRegistry} from "../src/KleosStamps.sol";

contract MockIdentity is IIdentityRegistry {
    mapping(uint256 => address) public owners;
    mapping(uint256 => address) public wallets;

    function set(uint256 agentId, address owner, address wallet) external {
        owners[agentId] = owner;
        wallets[agentId] = wallet;
    }

    function ownerOf(uint256 agentId) external view returns (address) {
        return owners[agentId];
    }

    function getAgentWallet(uint256 agentId) external view returns (address) {
        return wallets[agentId];
    }
}

contract KleosStampsTest is Test {
    MockIdentity identity;
    KleosStamps stamps;

    address owner = address(0xA11CE);
    address runtime = address(0xB0B);
    uint256 agentId = 1842;

    bytes32 receipt = keccak256("receipt-1");
    bytes32 settlement = keccak256("tx-1");

    function setUp() public {
        identity = new MockIdentity();
        identity.set(agentId, owner, runtime);
        stamps = new KleosStamps(identity);
    }

    function test_agentWalletCanStamp() public {
        vm.prank(runtime);
        stamps.stamp(agentId, receipt, settlement, "https://onchainrouter.io/tools/lending-rates", "onchainrouter", 10_000);

        KleosStamps.Stamp memory s = stamps.getStamp(receipt);
        assertEq(s.agentId, agentId);
        assertEq(s.settlementTx, settlement);
        assertEq(s.amount, 10_000);
        assertEq(s.wallet, runtime);
        assertGt(s.timestamp, 0);
        assertEq(stamps.stampCount(agentId), 1);
        assertTrue(stamps.isStamped(agentId, receipt));
        assertFalse(stamps.isStamped(agentId + 1, receipt));
    }

    function test_ownerCannotStampDirectly() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(KleosStamps.NotAgentWallet.selector, agentId, owner));
        stamps.stamp(agentId, receipt, settlement, "tool", "platform", 1);
    }

    function test_revokedWalletCannotStamp() public {
        identity.set(agentId, owner, address(0));
        vm.prank(runtime);
        vm.expectRevert(abi.encodeWithSelector(KleosStamps.NotAgentWallet.selector, agentId, runtime));
        stamps.stamp(agentId, receipt, settlement, "tool", "platform", 1);
    }

    function test_duplicateReceiptRejected() public {
        vm.startPrank(runtime);
        stamps.stamp(agentId, receipt, settlement, "tool", "platform", 1);
        vm.expectRevert(abi.encodeWithSelector(KleosStamps.AlreadyStamped.selector, receipt));
        stamps.stamp(agentId, receipt, settlement, "tool", "platform", 1);
        vm.stopPrank();
    }

    function test_settlementRequired() public {
        vm.prank(runtime);
        vm.expectRevert(KleosStamps.NoSettlement.selector);
        stamps.stamp(agentId, receipt, bytes32(0), "tool", "platform", 1);
    }

    function test_emitsStamped() public {
        vm.prank(runtime);
        vm.expectEmit(true, true, true, true);
        emit KleosStamps.Stamped(
            agentId, receipt, settlement, keccak256("tool"), "tool", "platform", 1, runtime, uint64(block.timestamp)
        );
        stamps.stamp(agentId, receipt, settlement, "tool", "platform", 1);
    }
}
