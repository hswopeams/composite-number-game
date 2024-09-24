const { ethers, network } = require("hardhat");
require("dotenv").config();

async function deployContracts() {
    // Deploy the Verifier contract
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();

    let tokenAddresses;

    if (network.name === "hardhat") {
        // Deploy the mock ERC20 token contract only if the network is hardhat
        const initialSupply = ethers.parseUnits("10000", 18); // 10,000 tokens
        const Token = await ethers.getContractFactory("MockERC20");
        const token = await Token.deploy("Test Token", "TTK", 18, initialSupply);
        const tokenAddress = await token.getAddress();
        tokenAddresses = [tokenAddress];

        // Transfer some tokens to the challenger so they can create challenges
        const [owner, challenger] = await ethers.getSigners();
        await token.connect(owner).transfer(await challenger.getAddress(), ethers.parseEther("1000"));
    } else {
        // Use the token addresses from the .env file if not on hardhat
        const tokenAddressesString = process.env.TOKEN_ADDRESSES;
        if (!tokenAddressesString) {
            throw new Error("TOKEN_ADDRESSES is not set in the .env file");
        }
        tokenAddresses = tokenAddressesString.split(",").map(address => address.trim());
    }

    // Deploy the CompositeNumberGame contract
    const CompositeNumberGame = await ethers.getContractFactory("CompositeNumberGame");
    const game = await CompositeNumberGame.deploy(tokenAddresses, await verifier.getAddress());

    return { tokenAddresses, verifier, game };
}

module.exports = { deployContracts };