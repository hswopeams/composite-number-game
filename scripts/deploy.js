const { ethers, run, network } = require("hardhat");
const { deployContracts } = require("../utils/deployContracts");
const fs = require("fs");

async function main() {
    const { tokenAddresses, verifier, game } = await deployContracts();

    const verifierAddress = await verifier.getAddress();
    const gameAddress = await game.getAddress();

    // Retrieve the chainId
    const chainId = network.config.chainId;

    console.log("Chain ID:", chainId);
    console.log("Verifier deployed to:", verifierAddress);
    console.log("CompositeNumberGame deployed to:", gameAddress);
    console.log("Tokens Supported:", tokenAddresses);
  
    // Write addresses and chainId to a file
    const addresses = {
        chainId: chainId,
        Verifier: verifierAddress,
        CompositeNumberGame: gameAddress,
        SupportedTokens: tokenAddresses,
    };

    fs.writeFileSync("deployedAddresses.json", JSON.stringify(addresses, null, 2));

    // Verify contracts if not on local network
    if (network.name !== "hardhat") {
        await verifyContract(verifierAddress, []);
        await verifyContract(gameAddress, [tokenAddresses, verifierAddress]);
    }
}

async function verifyContract(address, constructorArguments) {
    console.log(`Verifying contract at ${address}...`);
    try {
        await run("verify:verify", {
            address: address,
            constructorArguments: constructorArguments,
            force: true
        });
        console.log(`Contract at ${address} verified successfully.`);
    } catch (error) {
        console.error(`Failed to verify contract at ${address}:`, error);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });