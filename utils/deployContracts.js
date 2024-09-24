// utils/deployContracts.js
const { ethers } = require("hardhat");

async function deployContracts() {
    // Deploy the Verifier contract
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();

    // Deploy the ERC20 token contract
    const initialSupply = ethers.parseUnits("10000", 18); // 10,000 tokens
    const Token = await ethers.getContractFactory("MockERC20");
    const token = await Token.deploy("Test Token", "TTK", 18, initialSupply);

    // Deploy the CompositeNumberGame contract
    const tokenAddress = await token.getAddress();
    const CompositeNumberGame = await ethers.getContractFactory("CompositeNumberGame");
    const game = await CompositeNumberGame.deploy([tokenAddress], await verifier.getAddress());

    // Transfer some tokens to the challenger so they can create challenges
    const [owner, challenger] = await ethers.getSigners();
    await token.connect(owner).transfer(await challenger.getAddress(), ethers.parseEther("1000"));

    return { token, verifier, game };
}

module.exports = { deployContracts };