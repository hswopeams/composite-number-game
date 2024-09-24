const { ethers, run, network } = require("hardhat");
const { deployContracts } = require("../utils/deployContracts");
const fs = require("fs");

async function main() {
    const { token, verifier, game } = await deployContracts();

    const verifierAddress = await verifier.getAddress();
    const tokenAddress = await token.getAddress();
    const gameAddress = await game.getAddress();

     // Retrieve the chainId
     const chainId = network.config.chainId;

    console.log("Verifier deployed to:", verifierAddress);
    console.log("Token deployed to:", tokenAddress);
    console.log("CompositeNumberGame deployed to:", gameAddress);
    console.log("Chain ID:", network.config.chainId);


    // Write addresses and chainId to a file
    const addresses = {
        chainId: chainId,
        Verifier: verifierAddress,
        Token: tokenAddress,
        CompositeNumberGame: gameAddress
    };

    fs.writeFileSync("deployedAddresses.json", JSON.stringify(addresses, null, 2));

    // Verify contracts if not on local network
    if (network.name !== "hardhat") {
        await verifyContract(verifierAddress, []);
        await verifyContract(tokenAddress, ["Test Token", "TTK", 18, ethers.utils.parseUnits("10000", 18)]);
        await verifyContract(gameAddress, [[tokenAddress], verifierAddress]);
    }
}

async function verifyContract(address, constructorArguments) {
    console.log(`Verifying contract at ${address}...`);
    try {
        await run("verify:verify", {
            address: address,
            constructorArguments: constructorArguments,
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