// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {KleosStamps, IIdentityRegistry} from "../src/KleosStamps.sol";

/// Deploys KleosStamps against the ERC-8004 Identity Registry of the target
/// network. Registry addresses from erc-8004/erc-8004-contracts.
contract Deploy is Script {
    address constant IDENTITY_TESTNET = 0x8004A818BFB912233c491871b3d84c89A494BD9e; // Monad testnet 10143
    address constant IDENTITY_MAINNET = 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432; // Monad mainnet 143

    function run() external {
        address identity = block.chainid == 143 ? IDENTITY_MAINNET : IDENTITY_TESTNET;
        require(identity.code.length > 0, "identity registry not deployed on this chain");

        vm.startBroadcast();
        KleosStamps stamps = new KleosStamps(IIdentityRegistry(identity));
        vm.stopBroadcast();

        console.log("chain", block.chainid);
        console.log("identity", identity);
        console.log("KleosStamps", address(stamps));
    }
}
