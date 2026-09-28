// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IIdentityRegistry} from "../src/KleosStamps.sol";
import {KleosCredit, IKleosStamps} from "../src/KleosCredit.sol";

/// Deploys KleosCredit next to the existing KleosStamps. Testnet only for now:
/// mainnet has no KleosStamps yet.
contract DeployCredit is Script {
    address constant IDENTITY_TESTNET = 0x8004A818BFB912233c491871b3d84c89A494BD9e; // Monad testnet 10143
    address constant STAMPS_TESTNET = 0xb63DE9add37AF3Edd48Db8C1555578e6C1A8Cb18;

    function run() external {
        require(block.chainid == 10143, "KleosCredit: testnet only");
        require(IDENTITY_TESTNET.code.length > 0 && STAMPS_TESTNET.code.length > 0, "dependencies not deployed");

        vm.startBroadcast();
        KleosCredit credit = new KleosCredit(IIdentityRegistry(IDENTITY_TESTNET), IKleosStamps(STAMPS_TESTNET));
        vm.stopBroadcast();

        console.log("KleosCredit", address(credit));
    }
}
