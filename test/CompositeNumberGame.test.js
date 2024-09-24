const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, mine } = require("@nomicfoundation/hardhat-network-helpers");
const { execSync } = require("child_process");
const fs = require("fs");
const snarkjs = require('snarkjs');
const { deployContracts } = require("../utils/deployContracts");

describe("CompositeNumberGame", function () {
    this.timeout(300000); // Increase timeout

    const r1csPath = "circuit/composite-check.r1cs";
    const wasmPath = "circuit/composite-check_js/composite-check.wasm";
    const zkeyPath = "circuit/composite-check_final.zkey";
    const verificationKeyPath = "circuit/verification_key.json";
    const ptauPath = "circuit/powersOfTau28_hez_final_15.ptau";


    async function setupTestWithCircomFixture() {
        // Get signers
        [owner, challenger, solver] =
            await ethers.getSigners();

        const { tokenAddresses, verifier, game } = await deployContracts();

        // Assign the first token address to contracts.token
        const tokenAddress = tokenAddresses[0];
        const Token = await ethers.getContractFactory("MockERC20");
        const token = Token.attach(tokenAddress);

        const contracts = { token, verifier, game };
        compileCircuite();

        return { contracts, signers: { owner, challenger, solver } };
    }

    async function setupTestFixture() {
        // Get signers
        const [owner, challenger, solver] = await ethers.getSigners();
        const { tokenAddresses, verifier, game } = await deployContracts();

        // Assign the first token address to contracts.token
        const tokenAddress = tokenAddresses[0];
        const Token = await ethers.getContractFactory("MockERC20");
        const token = Token.attach(tokenAddress);

        const contracts = { token, verifier, game };

        return { contracts, signers: { owner, challenger, solver } };
    }

    function compileCircuite() {
        // Compile the circuit
        console.log("Compiling the circuit...");
        execSync(`npx circom circuit/composite-check.circom --r1cs --wasm --sym --output circuit`, { stdio: 'inherit' });
    }

    function generateWitness(input) {
        console.log("Generating witness with input:", input);
        const { n, factor1, factor2 } = input;
        console.log("n in generateWitness:", n);
        const witnessInput = {
            n: n,
            factor1: factor1,
            factor2: factor2
        };
        console.log("Generating witness with input:", witnessInput);
        fs.writeFileSync("circuit/input.json", JSON.stringify(input));
        execSync(`node circuit/composite-check_js/generate_witness.js ${wasmPath} circuit/input.json circuit/witness.wtns`);

        // Read and log the contents of circuit/input.json
        const inputJson = fs.readFileSync("circuit/input.json", "utf8");
        console.log("Contents of circuit/input.json:", inputJson);
    }

    function generateProof() {
        try {
            console.log("Generating proof...");
            execSync(`npx snarkjs groth16 prove ${zkeyPath} circuit/witness.wtns circuit/proof.json circuit/public.json`, { stdio: 'inherit' });
            // Read and log the contents of circuit/input.json
            const publicJson = fs.readFileSync("circuit/public.json", "utf8");
            console.log("Contents of circuit/public.json:", publicJson);
        } catch (error) {
            console.error("Error during proof generation:", error);
            throw error;
        }
    }

    function verifyProof(expectedN) {
        try {
            console.log("Verifying proof...");
            const result = execSync(`npx snarkjs groth16 verify ${verificationKeyPath} circuit/public.json circuit/proof.json`);
            console.log("Verification result: ", result.toString());
            return result.toString().includes("OK");
        } catch (error) {
            console.error("Error during proof verification:", error);
            return false;
        }
    }


    function getCalldata() {
        try {
            const calldata = execSync(`npx snarkjs zkey export soliditycalldata circuit/public.json circuit/proof.json`);
            console.log("Raw Calldata in getCallData:", calldata.toString());

            // Wrap the raw output in square brackets to form a valid JSON array
            const wrappedCalldata = `[${calldata.toString().trim()}]`;
            console.log("Calldata:", wrappedCalldata);
            return JSON.parse(wrappedCalldata);
        } catch (error) {
            console.error("Error in getCalldata:", error);
            throw error;
        }
    }

    context("constructor", function () {
        context("Happy Path Test Cases", function () {
            it("should initialize the contract correctly", async function () {
                const { contracts, signers } = await setupTestFixture();
                console.log("token contract", contracts.token);

                // Check that the verifier address is set correctly
                expect(await contracts.game.verifier()).to.equal(await contracts.verifier.getAddress());

                // Check that the supported tokens are set correctly
                expect(await contracts.game.supportedTokens(await contracts.token.getAddress())).to.be.true;

                // Check that the prize pool for the supported token is zero
                expect(await contracts.game.prizePools(await contracts.token.getAddress())).to.equal(0);

            });
        }); // End of Happy Path Test Cases

        context("Error Test Cases", function () {
            it("should revert if verifier address is zero address", async function () {
                // Deploy the ERC20 token contract
                const initialSupply = ethers.parseUnits("10000", 18); //10,000 tokens
                const Token = await ethers.getContractFactory("MockERC20");
                token = await Token.deploy("Test Token", "TTK", 18, initialSupply);

                // Deploy the CompositeNumberGame contract
                const tokenAddress = await token.getAddress();
                const CompositeNumberGame = await ethers.getContractFactory("CompositeNumberGame");

                await expect(
                    CompositeNumberGame.deploy([tokenAddress], ethers.ZeroAddress)
                ).to.be.revertedWithCustomError(CompositeNumberGame, "InvalidAddress");
            });
        }); // End of Error Test Cases
    }); // End of constructor context

    context("createChallenge", function () {
        context("Happy Path Test Cases", function () {
            it("should correctly create a challenge for a composite number n", async function () {
                const { contracts, signers } = await loadFixture(setupTestWithCircomFixture);

                // Create a challenge
                const n = 33;
                const factor1 = 3;
                const factor2 = 11;
                const rewardAmount = ethers.parseEther("100");
                await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);

                // Get balances before
                const challengerBalanceBefore = await contracts.token.balanceOf(signers.challenger.address,);
                const gameBalanceBefore = await contracts.token.balanceOf(contracts.game.getAddress());


                // Generate witness, proof, and verify
                await generateWitness({ n, factor1, factor2 });
                await generateProof();

                // Checking that proof is mathematically valid in JS as a sanity check
                const isValid = await verifyProof(n);
                expect(isValid).to.be.true;

                // Get calldata
                const calldata = await getCalldata();

                // Destructure calldata correctly
                const [pA, pB, pC, pubSignals] = calldata;


                // create the challenge
                const tx = await contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals);

                // Check balances after
                const challengerBalanceAfter = await contracts.token.balanceOf(signers.challenger.address,);
                const gameBalanceAfter = await contracts.token.balanceOf(contracts.game.getAddress());

                expect(challengerBalanceAfter).to.equal(challengerBalanceBefore - rewardAmount);
                expect(gameBalanceAfter).to.equal(gameBalanceBefore + rewardAmount);

                // Check state
                const challenge = await contracts.game.challenges(n);
                expect(challenge.n).to.equal(n);
                expect(challenge.rewardAmount).to.equal(rewardAmount);
                expect(challenge.blockNumber).to.equal(tx.blockNumber);
                expect(challenge.challenger).to.equal(signers.challenger.address);
                expect(challenge.rewardToken).to.equal(await contracts.token.getAddress());
                expect(challenge.solver).to.equal(ethers.ZeroAddress);

                // Check event
                await expect(tx)
                    .to.emit(contracts.game, "ChallengeCreated")
                    .withArgs(n, signers.challenger, await contracts.token.getAddress(), rewardAmount);


            });
        }); // End of Happy Path Test Cases

        context("Error Test Cases", function () {
            it("should revert if n is composite but factors are not correct", async function () {
                const { contracts, signers } = await loadFixture(setupTestWithCircomFixture);

                // Create a challenge
                const n = 33;
                const factor1 = 2;
                const factor2 = 11;
                const rewardAmount = ethers.parseEther("100");
                await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);


                // Generate witness, proof, and verify
                await generateWitness({ n, factor1, factor2 });
                await generateProof();

                // Checking that proof is mathematically valid in JS as a sanity check
                const isValid = await verifyProof(n);
                expect(isValid).to.be.true;

                // Get calldata
                const calldata = await getCalldata();

                // Destructure calldata correctly
                const [pA, pB, pC, pubSignals] = calldata;

                await expect(
                    contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals)
                ).to.be.revertedWithCustomError(contracts.game, "NotComposite").withArgs(0);
            });

            it("should revert if n is prime (not composite)", async function () {
                const { contracts, signers } = await loadFixture(setupTestWithCircomFixture);

                // Create a challenge
                const n = 11;
                const factor1 = 1;
                const factor2 = 11;
                const rewardAmount = ethers.parseEther("100");
                await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);


                // Generate witness, proof, and verify
                await generateWitness({ n, factor1, factor2 });
                await generateProof();

                // Checking that proof is mathematically valid in JS as a sanity check
                const isValid = await verifyProof(n);
                expect(isValid).to.be.true;

                // Get calldata
                const calldata = await getCalldata();

                // Destructure calldata correctly
                const [pA, pB, pC, pubSignals] = calldata;

                await expect(
                    contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals)
                ).to.be.revertedWithCustomError(contracts.game, "NotComposite").withArgs(0);
            });


            it("should revert if proof is invalid", async function () {
                const { contracts, signers } = await loadFixture(setupTestWithCircomFixture);

                // Create a challenge
                const n = 33;
                const factor1 = 3; // Correct factor
                const factor2 = 11; // Correct factor
                const rewardAmount = ethers.parseEther("100");
                await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);

                // Generate witness, proof, and verify
                await generateWitness({ n, factor1, factor2 });
                await generateProof();

                // Tamper with the proof to make it invalid
                const proofJson = JSON.parse(fs.readFileSync("circuit/proof.json", "utf8"));
                proofJson.pi_a[0] = "1"; // Change the first element of pi_a to make the proof invalid
                fs.writeFileSync("circuit/proof.json", JSON.stringify(proofJson));

                const isValid = await verifyProof();
                console.log("Proof verification result:", isValid);
                expect(isValid).to.be.false;

                // Get calldata
                const calldata = await getCalldata();

                // Destructure calldata correctly
                const [pA, pB, pC, pubSignals] = calldata;

                await expect(
                    contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals)
                ).to.be.revertedWithCustomError(contracts.game, "InvalidProof");
            });
        }); // End of Error test cases
    }); // End of createChallenge context


    context("solveChallenge", function () {
        context("Happy Path Test Cases", function () {
            it("should solve the challenge for composite number 33", async function () {
                const { contracts, signers } = await loadFixture(setupTestWithCircomFixture);

                // Create a challenge
                const n = 33;
                const factor1 = 3;
                const factor2 = 11;
                const rewardAmount = ethers.parseEther("100");
                await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);
                // Generate witness, proof, and verify
                await generateWitness({ n, factor1, factor2 });
                await generateProof();

                // Checking that proof is mathematically valid in JS as a sanity check
                const isValid = await verifyProof(n);
                expect(isValid).to.be.true;

                // Get calldata
                const calldata = await getCalldata();

                // Destructure calldata correctly
                const [pA, pB, pC, pubSignals] = calldata;

                // Create the challenge
                await contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals);

                // Solve the challenge
                const tx = await contracts.game.connect(signers.solver).solveChallenge(n, pA, pB, pC, pubSignals);

                // Check balances
                const solverBalance = await contracts.game.balances(signers.solver.address, await contracts.token.getAddress());
                expect(solverBalance).to.equal(rewardAmount / 2n);

                const prizePool = await contracts.game.prizePools(await contracts.token.getAddress());
                expect(prizePool).to.equal(rewardAmount / 2n);

                // Check state
                const challenge = await contracts.game.challenges(n);
                expect(challenge.solver).to.equal(signers.solver.address);

                // Check for events
                await expect(tx)
                    .to.emit(contracts.game, "ChallengeSolved")
                    .withArgs(n, signers.solver, await contracts.token.getAddress(), rewardAmount / 2n, rewardAmount / 2n);
            });
        });

        context("Error Test Cases", function () {
            it("should revert if factors not correct to prove 33 is composite", async function () {
                const { contracts, signers } = await loadFixture(setupTestWithCircomFixture);

                // Create a challenge
                const n = 33;
                const factor1 = 3;
                const factor2 = 11;
                const rewardAmount = ethers.parseEther("100");
                await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);

                // Generate witness, proof, and verify
                await generateWitness({ n, factor1, factor2 });
                await generateProof();

                // Checking that proof is mathematically valid in JS as a sanity check
                const isValid = await verifyProof(n);
                expect(isValid).to.be.true;

                // Get calldata
                const calldata = await getCalldata();

                // Destructure calldata correctly
                const [pA, pB, pC, pubSignals] = calldata;

                // Create the challenge
                await contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals);


                // Try to solve the challenge with incorrect factors for 33
                const factor1Solve = 2;
                const factor2Solve = 11;

                // Generate witness, proof, and verify
                await generateWitness({ n, factor1: factor1Solve, factor2: factor2Solve });
                await generateProof();

                // Checking that proof is mathematically valid in JS as a sanity check
                const isValidSolveProof = await verifyProof(n);
                expect(isValidSolveProof).to.be.true;

                // Get calldata
                const calldataSolve = await getCalldata();

                // Destructure calldata correctly
                const [pASolve, pBSolve, pCSolve, pubSignalsSolve] = calldataSolve;

                await expect(
                    contracts.game.connect(signers.solver).solveChallenge(n, pASolve, pBSolve, pCSolve, pubSignalsSolve)
                ).to.be.revertedWithCustomError(contracts.game, "NotComposite").withArgs(0);
            });

            it("should revert if proof is valid but for wrong n", async function () {
                const { contracts, signers } = await loadFixture(setupTestWithCircomFixture);

                let n, factor1, factor2;
                let rewardAmount;
                let isValid;
                let calldata, pA, pB, pC, pubSignals;

                // Create challenge 1
                n = 33;
                factor1 = 3;
                factor2 = 11;
                rewardAmount = ethers.parseEther("100");
                await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);

                // Generate witness, proof, and verify
                await generateWitness({ n, factor1, factor2 });
                await generateProof();

                // Checking that proof is mathematically valid in JS as a sanity check
                isValid = await verifyProof(n);
                expect(isValid).to.be.true;

                // Get calldata
                calldata = await getCalldata();

                // Destructure calldata correctly
                [pA, pB, pC, pubSignals] = calldata;

                // Create the challenge
                await contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals);

                // Create challenge 2
                n = 100;
                factor1 = 20;
                factor2 = 5;
                rewardAmount = ethers.parseEther("100");
                await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);

                // Generate witness, proof, and verify
                await generateWitness({ n, factor1, factor2 });
                await generateProof();

                // Checking that proof is mathematically valid in JS as a sanity check
                isValid = await verifyProof(n);
                expect(isValid).to.be.true;

                // Get calldata
                calldata = await getCalldata();

                // Destructure calldata correctly
                [pA, pB, pC, pubSignals] = calldata;

                // Create the challenge
                await contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals);


                // Try to solve the challenge for wrong n
                const nSolve = 33;
                const factor1Solve = 3;
                const factor2Solve = 11;

                // Generate witness, proof, and verify
                await generateWitness({ n: nSolve, factor1: factor1Solve, factor2: factor2Solve });
                await generateProof();

                // Checking that proof is mathematically valid in JS as a sanity check
                const isValidSolveProof = await verifyProof(nSolve);
                expect(isValidSolveProof).to.be.true;

                // Get calldata
                const calldataSolve = await getCalldata();

                // Destructure calldata correctly
                const [pASolve, pBSolve, pCSolve, pubSignalsSolve] = calldataSolve;

                await expect(
                    contracts.game.connect(signers.solver).solveChallenge(n, pASolve, pBSolve, pCSolve, pubSignalsSolve)
                ).to.be.revertedWithCustomError(contracts.game, "ProofNotForN").withArgs(n);
            });

            it("should revert if proof is invalid", async function () {
                const { contracts, signers } = await loadFixture(setupTestWithCircomFixture);

                // Create a challenge
                const n = 33;
                const factor1 = 3;
                const factor2 = 11;
                const rewardAmount = ethers.parseEther("100");
                await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);

                // Generate witness, proof, and verify
                await generateWitness({ n, factor1, factor2 });
                await generateProof();

                // Checking that proof is mathematically valid in JS as a sanity check
                const isValid = await verifyProof(n);
                expect(isValid).to.be.true;

                // Get calldata
                const calldata = await getCalldata();

                // Destructure calldata correctly
                const [pA, pB, pC, pubSignals] = calldata;

                // Create the challenge
                await contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals);


                // Generate valid proof for 33
                const nSolve = 33;
                const factor1Solve = 3;
                const factor2Solve = 11;

                // Generate witness, proof, and verify
                await generateWitness({ n: nSolve, factor1: factor1Solve, factor2: factor2Solve });
                await generateProof();

                // Tamper with the proof to make it invalid
                const proofJson = JSON.parse(fs.readFileSync("circuit/proof.json", "utf8"));
                proofJson.pi_a[0] = "1"; // Change the first element of pi_a to make the proof invalid
                fs.writeFileSync("circuit/proof.json", JSON.stringify(proofJson));

                // Checking that proof is mathematically valid in JS as a sanity check
                const isValidSolveProof = await verifyProof(n);
                expect(isValidSolveProof).to.be.false;

                // Get calldata
                const calldataSolve = await getCalldata();

                // Destructure calldata correctly
                const [pASolve, pBSolve, pCSolve, pubSignalsSolve] = calldataSolve;

                await expect(
                    contracts.game.connect(signers.solver).solveChallenge(n, pASolve, pBSolve, pCSolve, pubSignalsSolve)
                ).to.be.revertedWithCustomError(contracts.game, "InvalidProof");
            });
        });
    }); // End of solveChallenge context

    context("withdraw", function () {
        context("Happy Path Test Cases", function () {
            it("should allow a user to withdraw tokens", async function () {
                const { contracts, signers } = await setupTestWithCircomFixture();

                // Transfer some tokens to the challenger and solver
                const rewardAmount = ethers.parseUnits("100", 18); // 100 tokens
                await contracts.token.transfer(signers.challenger.address, rewardAmount);

                // Approve the game contract to spend tokens on behalf of the challenger
                await contracts.token.connect(signers.challenger).approve(contracts.game.getAddress(), rewardAmount);

                // Create a challenge
                const n = 33;
                const factor1 = 3;
                const factor2 = 11;
                await generateWitness({ n, factor1, factor2 });
                await generateProof();
                const calldata = await getCalldata();
                const [pA, pB, pC, pubSignals] = calldata;
                await contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals);


                // Solve the challenge
                const factor1Solve = 3;
                const factor2Solve = 11;
                await generateWitness({ n, factor1: factor1Solve, factor2: factor2Solve });
                await generateProof();
                const calldataSolve = await getCalldata();
                const [pASolve, pBSolve, pCSolve, pubSignalsSolve] = calldataSolve;
                await contracts.game.connect(signers.solver).solveChallenge(n, pASolve, pBSolve, pCSolve, pubSignalsSolve);

                // Check the solver's balance before withdrawal
                const balanceBefore = await contracts.game.balances(signers.solver.address, await contracts.token.getAddress());
                expect(balanceBefore).to.equal(rewardAmount / 2n);

                // Withdraw tokens
                await contracts.game.connect(solver).withdraw(rewardAmount / 2n, await contracts.token.getAddress());

                // Check the solver's balance after withdrawal
                const balanceAfter = await contracts.game.balances(signers.solver.address, await contracts.token.getAddress());
                expect(balanceAfter).to.equal(0);

                // Check the solver's token balance
                const tokenBalance = await contracts.token.balanceOf(signers.solver.address);
                expect(tokenBalance).to.equal(rewardAmount / 2n);
            });
        }); // End of Happy Path Test Cases

        context("Error Test Cases", function () {
            it("should revert if the user tries to withdraw more than their balance", async function () {
                const { contracts, signers } = await setupTestWithCircomFixture();

                // Transfer some tokens to the challenger and solver
                const rewardAmount = ethers.parseUnits("100", 18); // 100 tokens
                await contracts.token.transfer(signers.challenger.address, rewardAmount);

                // Approve the game contract to spend tokens on behalf of the challenger
                await contracts.token.connect(signers.challenger).approve(contracts.game.getAddress(), rewardAmount);

                // Create a challenge
                const n = 33;
                const factor1 = 3;
                const factor2 = 11;
                await generateWitness({ n, factor1, factor2 });
                await generateProof();
                const calldata = await getCalldata();
                const [pA, pB, pC, pubSignals] = calldata;
                await contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals);


                // Solve the challenge
                const factor1Solve = 3;
                const factor2Solve = 11;
                await generateWitness({ n, factor1: factor1Solve, factor2: factor2Solve });
                await generateProof();
                const calldataSolve = await getCalldata();
                const [pASolve, pBSolve, pCSolve, pubSignalsSolve] = calldataSolve;
                await contracts.game.connect(signers.solver).solveChallenge(n, pASolve, pBSolve, pCSolve, pubSignalsSolve);

                // Check the solver's balance before withdrawal
                const balanceBefore = await contracts.game.balances(signers.solver.address, await contracts.token.getAddress());
                expect(balanceBefore).to.equal(rewardAmount / 2n);

                // Attempt to withdraw too much
                await expect(
                    contracts.game.connect(solver).withdraw(rewardAmount, await contracts.token.getAddress())
                ).to.be.revertedWithCustomError(contracts.game, "InsufficientBalance").withArgs(rewardAmount, balanceBefore);

            });
        });

        context("claimExpiredChallenge", function () {
            context("Happy Path Test Cases", function () {
                it("should allow a user to claim the reward for an expired challenge", async function () {
                    const { contracts, signers } = await loadFixture(setupTestWithCircomFixture);

                    // Create a challenge
                    const n = 33;
                    const factor1 = 3;
                    const factor2 = 11;
                    const rewardAmount = ethers.parseEther("100");
                    await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);

                    // Generate witness, proof, and verify
                    await generateWitness({ n, factor1, factor2 });
                    await generateProof();

                    // Checking that proof is mathematically valid in JS as a sanity check
                    const isValid = await verifyProof(n);
                    expect(isValid).to.be.true;

                    // Get calldata
                    const calldata = await getCalldata();

                    // Destructure calldata correctly
                    const [pA, pB, pC, pubSignals] = calldata;


                    // create the challenge
                    const tx = await contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals);

                    // Get Reward token address
                    const challenge = await contracts.game.challenges(n);

                    // Advance the blockchain by more than T blocks
                    const t = await contracts.game.T();
                    await mine(t + 1n);

                    // Get balances before claiming the reward
                    const challengerBalanceBefore = await contracts.game.balances(signers.challenger.address, challenge.rewardToken);
                    const prizePoolBalanceBefore = await contracts.game.prizePools(challenge.rewardToken);

                    // Challenger claims the expired challenge
                    await contracts.game.connect(signers.challenger).claimExpiredChallenge(n);

                    // Check the final balances after claiming the reward
                    const challengerBalanceAfter = await contracts.game.balances(signers.challenger.address, challenge.rewardToken);
                    const prizePoolBalanceAfter = await contracts.game.prizePools(challenge.rewardToken);

                    // Challenger should receive 100% of the reward and 50% of the prize pool
                    const expectedChallengerBalance = challengerBalanceBefore + rewardAmount + (prizePoolBalanceBefore / 2n);
                    const expectedPrizePoolBalance = prizePoolBalanceBefore - (prizePoolBalanceBefore / 2n);

                    expect(challengerBalanceAfter).to.equal(expectedChallengerBalance);
                    expect(prizePoolBalanceAfter).to.equal(expectedPrizePoolBalance);
                });
            }); // End of Happy Path Test Cases

            context("Error Test Cases", function () {
                it("should revert if the challenge is not expired", async function () {
                    const { contracts, signers } = await loadFixture(setupTestWithCircomFixture);

                    // Create a challenge
                    const n = 33;
                    const factor1 = 3;
                    const factor2 = 11;
                    const rewardAmount = ethers.parseEther("100");
                    await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);

                    // Generate witness, proof, and verify
                    await generateWitness({ n, factor1, factor2 });
                    await generateProof();

                    // Checking that proof is mathematically valid in JS as a sanity check
                    const isValid = await verifyProof(n);
                    expect(isValid).to.be.true;

                    // Get calldata
                    const calldata = await getCalldata();

                    // Destructure calldata correctly
                    const [pA, pB, pC, pubSignals] = calldata;


                    // create the challenge
                    const tx = await contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals);

                    // Get Reward token address
                    const challenge = await contracts.game.challenges(n);

                    // Get balances before claiming the reward
                    const challengerBalanceBefore = await contracts.game.balances(signers.challenger.address, challenge.rewardToken);
                    const prizePoolBalanceBefore = await contracts.game.prizePools(challenge.rewardToken);

                    // Challenger claims the expired challenge
                    await expect(
                        contracts.game.connect(signers.challenger).claimExpiredChallenge(n)
                    ).to.be.revertedWithCustomError(contracts.game, "ChallengeNotExpired").withArgs(n);
                });

                it("should revert if caller is not the challenger", async function () {
                    const { contracts, signers } = await loadFixture(setupTestWithCircomFixture);

                    // Create a challenge
                    const n = 33;
                    const factor1 = 3;
                    const factor2 = 11;
                    const rewardAmount = ethers.parseEther("100");
                    await contracts.token.connect(signers.challenger).approve(await contracts.game.getAddress(), rewardAmount);

                    // Generate witness, proof, and verify
                    await generateWitness({ n, factor1, factor2 });
                    await generateProof();

                    // Checking that proof is mathematically valid in JS as a sanity check
                    const isValid = await verifyProof(n);
                    expect(isValid).to.be.true;

                    // Get calldata
                    const calldata = await getCalldata();

                    // Destructure calldata correctly
                    const [pA, pB, pC, pubSignals] = calldata;


                    // create the challenge
                    const tx = await contracts.game.connect(signers.challenger).createChallenge(n, await contracts.token.getAddress(), rewardAmount, pA, pB, pC, pubSignals);

                    // Get Reward token address
                    const challenge = await contracts.game.challenges(n);

                    // Advance the blockchain by more than T blocks
                    const t = await contracts.game.T();
                    await mine(t + 1n);

                    // Get balances before claiming the reward
                    const challengerBalanceBefore = await contracts.game.balances(signers.challenger.address, challenge.rewardToken);
                    const prizePoolBalanceBefore = await contracts.game.prizePools(challenge.rewardToken);

                    // Challenger claims the expired challenge
                    await expect(
                        contracts.game.connect(signers.solver).claimExpiredChallenge(n)
                    ).to.be.revertedWithCustomError(contracts.game, "UnauthorizedChallenger").withArgs(signers.solver.address);
                });
            }); // End of Error Test Cases
        }); // End of claimExpiredChallenge context

    }); // End of withdraw context
});