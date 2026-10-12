// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {KleosStamps, IIdentityRegistry} from "../src/KleosStamps.sol";
import {KleosCredit, IKleosStamps} from "../src/KleosCredit.sol";

/// Deploys a fresh KleosStamps and a KleosCredit that reads it, in one broadcast.
/// Used for the launch reset: every record starts from zero on the new pair.
contract DeployAll is Script {
    address constant IDENTITY_TESTNET = 0x8004A818BFB912233c491871b3d84c89A494BD9e; // Monad testnet 10143

    function run() external {
        require(block.chainid == 10143, "Kleos: testnet only");
        require(IDENTITY_TESTNET.code.length > 0, "identity registry not deployed on this chain");

        vm.startBroadcast();
        KleosStamps stamps = new KleosStamps(IIdentityRegistry(IDENTITY_TESTNET));
        KleosCredit credit = new KleosCredit(IIdentityRegistry(IDENTITY_TESTNET), IKleosStamps(address(stamps)));
        vm.stopBroadcast();

        console.log("KleosStamps", address(stamps));
        console.log("KleosCredit", address(credit));
    }
}
