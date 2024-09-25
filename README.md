# Composite Number Game

## Description

The CompositeNumberGame contract implements a game in which any user can submit a uint N, which will define a challenge. A non-zero number of a chosen ERC20-compatible tokens define the reward. Within a constant timeframe, defined as 10 blocks, any user can solve a challenge by proving N is a composite number. If the proof is correct, the solver will receive 50% of the reward for the challenge, and the other 50% of the reward stays in the contract as part of the prize pool. If with in 10 blocks no one solves the challenge, the challenger will receive 100% of the reward provided for the challenge and 50% of the same token in the prize pool.

The CompositeNumberGame contract has been deployed to Ethereum Sepolia testnet at address [0xc02aA38B0E01CaA7bC1F7561237A75632359Ff1C](https://sepolia.etherscan.io/address/0xc02aA38B0E01CaA7bC1F7561237A75632359Ff1C) The supported token is [USDC](https://sepolia.etherscan.io/address/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238). The Verifier contract can be found at address [0xa4eE2a728EafA976aCAb4C5d6516B5902C9FeE88](https://sepolia.etherscan.io/address/0xa4eE2a728EafA976aCAb4C5d6516B5902C9FeE88)

## Implementation
In order to create a challenge, a challenger must submit a zero knowledge proof proving that N is composite. The [circuit/composite-check.circom](circuit/composite-check.circom) implements a simple circom circuit that accepts a N and two factors. The circuit determines if N is composite by checking the following:
* N is greater than 1
* factor1 * factor2 = N
* Neither factor1 nor factor2 is 1
* Neither factor 1 nor factor2 is N

By providing a zero knowledge proof, the challenger can prove to the CompositeNumberGame that N is a composite number (and thus eligible for the challenge) without revealing the factors that prove that N is composite. If the `createChallenge` function just accepted N, factor1, and factor2 in plain text and itself executed the compositeness test, a malicious actor could watch the mempool solve the challenge as soon as it is created. 

The `solveChallenge` function also requires the solver to provide a zero knowledge proof to prove s/he has solved the challenge. By not allowing the solver to pass N, factor1 and factor2 in plaintext, this prevents frontrunners who may be watching the mempool from solving the challenge first without doing the work.

Note that the ciruit should work for values of n up to 64-bit numbers, but really large numbers haven't been tested.

A challenger can call the `claimExpiredChallenge` to claim the reward tokens back and get 50% of that token's prize pool.

Both solvers and challengers can witdraw their funds by calling the `withdraw` function.

[contracts/Verifier.sol](Verifier.sol) was generated by snarkjs for [circuit/composite-check.circom](circuit/composite-check.circom) 

## Design Decisions
The CompositeNumberGame uses zero knowledge proofs to keep the factors that prove that N is composite private both when creating and solving a challenge. This is to prevent front-running and malicious actors who don't want to do the work to solve the challenge.

The owner provides a listt of supported tokens at deployment time. A challenger can provide any of the supported tokens as a reward token. This allows flexibility while also preventing ramdom, possibly malicious tokens, from being added as reward tokens. These malicous tokens could then end up in a solver's wallet.

## Testing
Several unit test cases have been created, but the test cases are not exhaustive. Normally before going to production, I would strive for 100% coverage on all branches. The unit test cases in this repo only test the basic functionality and show how I set up unit tests.

## Installation
After cloning the composite-number-game rep from GitHub, run 

```
npm install

```
Circom is required for testing the composite-number-game repo. It has been configured as a submodule. To clone and initialize the circom submodule, run

```
git submodule update --init --recursive

```

Circom uses cargo build to compile. Change to the circom directory and run.

```
cargo build --release

```
 See <https://www.rust-lang.org/tools/install> for instruction on installing Rust tools, including cargo

 Change back to the composite-number-game root directory and create a symlink to circom/target/release in node_modules/.bin:

```
 ln -s $(pwd)/circom/target/release/circom $(pwd)/node_modules/.bin/circom

```

This allows circom to be run as a local library using `npx circom`

## Scripts
To run the unit tests, run

```
npm test

```

To check test coverage, run 

```
npm run coverage

```



To see gas estimats, run

```
npm run report-gas

```

To compile without testing, run

```
npm run build

```

To lint solidity, run

```
npm run solhint

```

To deploy to Sepolia testnet and verify, copy .env.exmaple to .env and provide values for properties. Most are selp-explanatory. The `TOKEN_ADDRESSES `property is an array
of supported tokens that will be passed to the CompositeNumberGame constructor. After doing that, run

```
npm run deploy:sepolia

```
