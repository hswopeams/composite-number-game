const { expect } = require("chai");
const { ethers } = require("hardhat");
const { execSync } = require("child_process");
const fs = require("fs");

describe("CompositeNumberGame", function () {
    this.timeout(300000); // Increase timeout

    const r1csPath = "circuit/composite-check.r1cs";
    const wasmPath = "circuit/composite-check_js/composite-check.wasm";
    const zkeyPath = "circuit/composite-check_final.zkey";
    const verificationKeyPath = "circuit/verification_key.json";
    const ptauPath = "circuit/powersOfTau28_hez_final_15.ptau";

    let verifier, game, token;
    let owner, alice, bob, solver;

    before(async function () {
        // Compile the circuit
        console.log("Compiling the circuit...");
        execSync(`npx circom circuit/composite-check.circom --r1cs --wasm --sym --output circuit`, { stdio: 'inherit' });

        // Generate the keys
        console.log("Generating the keys...");
        execSync(`npx snarkjs groth16 setup ${r1csPath} ${ptauPath} ${zkeyPath}`, { stdio: 'inherit' });
        execSync(`npx snarkjs zkey export verificationkey ${zkeyPath} ${verificationKeyPath}`, { stdio: 'inherit' });


    });

    beforeEach(async function () {
        // Get signers
        [owner, challenger, solver] =
            await ethers.getSigners();

        // Deploy the Verifier contract
        const Verifier = await ethers.getContractFactory("Groth16Verifier");
        verifier = await Verifier.deploy();

        // Deploy the ERC20 token contract
        const initialSupply = ethers.parseUnits("10000", 18); //10,000 tokens
        const Token = await ethers.getContractFactory("MockERC20");
        token = await Token.deploy("Test Token", "TTK", 18, initialSupply);

        // Deploy the CompositeNumberGame contract
        const tokenAddress = await token.getAddress();
        const CompositeNumberGame = await ethers.getContractFactory("CompositeNumberGame");
        game = await CompositeNumberGame.deploy([tokenAddress], await verifier.getAddress());

        // Transfer some tokens to the challenger so they can create challenges
        await token.connect(owner).transfer(await challenger.getAddress(), ethers.parseEther("1000"));
    });

    async function generateWitness(input) {
        fs.writeFileSync("circuit/input.json", JSON.stringify(input));
        execSync(`node circuit/composite-check_js/generate_witness.js ${wasmPath} circuit/input.json circuit/witness.wtns`);
    }

    async function generateProof() {
        try {
            console.log("Generating proof...");
            execSync(`npx snarkjs groth16 prove ${zkeyPath} circuit/witness.wtns circuit/proof.json circuit/public.json`, { stdio: 'inherit' });
        } catch (error) {
            console.error("Error during proof generation:", error);
            throw error;
        }
    }

    async function verifyProof() {
        try {
            console.log("Verifying proof...");
            const result = execSync(`npx snarkjs groth16 verify ${verificationKeyPath} circuit/public.json circuit/proof.json`);
            console.log("Verification result: ", result.toString());
            return result.toString().includes("OK");
        } catch (error) {
            console.error("Error during proof verification:", error);
            throw error;
        }
    }

    async function getCalldata() {
        try {
            const calldata = execSync(`npx snarkjs zkey export soliditycalldata circuit/public.json circuit/proof.json`);

            // Wrap the raw output in square brackets to form a valid JSON array
            const wrappedCalldata = `[${calldata.toString().trim()}]`;
            return JSON.parse(wrappedCalldata);
        } catch (error) {
            console.error("Error in getCalldata:", error);
            throw error;
        }
    }

    it("should solve the challenge for composite number 33", async function () {
        // Create a challenge
        const n = 33;
        const rewardAmount = ethers.parseEther("100");
        await token.connect(challenger).approve(await game.getAddress(), rewardAmount);
        await game.connect(challenger).createChallenge(n, await token.getAddress(), rewardAmount);

        // Generate witness, proof, and verify
        await generateWitness({ n });
        await generateProof();
        const isValid = await verifyProof();
        expect(isValid).to.be.true;

        // Get calldata
        const calldata = await getCalldata();

        // Destructure calldata correctly
        const [pA, pB, pC, pubSignals] = calldata;

        // Solve the challenge
        await game.connect(solver).solveChallenge(n, pA, pB, pC, pubSignals);

        // Check balances
        const solverBalance = await game.balances(solver.address, await token.getAddress());
        expect(solverBalance).to.equal(rewardAmount / 2n);

        const prizePool = await game.prizePools(await token.getAddress());
        expect(prizePool).to.equal(rewardAmount / 2n);
    });

    it("should revert with InvalidChallenge error", async function () {
        const n = 1;
        const rewardAmount = ethers.parseEther("100");
        await token.connect(challenger).approve(await game.getAddress(), rewardAmount);

        await expect(
            game.connect(challenger).createChallenge(n, await token.getAddress(), rewardAmount)
        ).to.be.revertedWithCustomError(game, "InvalidChallenge");
    });
});