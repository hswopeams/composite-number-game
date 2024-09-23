// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IVerifier} from "./IVerfier.sol";

import "hardhat/console.sol";

contract CompositeNumberGame {
    using SafeERC20 for IERC20;

    /// @notice Timeframe in blocks
    uint256 public constant T = 10;

    /// @notice Verifier contract interface
    IVerifier public verifier;

    /// @notice Struct to store challenge details
    struct Challenge {
        uint256 n;
        uint256 rewardAmount;
        uint256 blockNumber;
        address challenger;
        address rewardToken;
        address solver;
    }

    /// @notice Mapping to store supported tokens by token address
    mapping(address => bool) supportedTokens;

    /// @notice Mapping to store challenges by challenge n value
    mapping(uint256 => Challenge) public challenges;

    /// @notice Mapping to store prize pools by token address
    mapping(address => uint256) public prizePools;

    /// @notice Mapping to store user balances by user address and token address
    mapping(address => mapping(address => uint256)) public balances;

    /// @notice Event emitted when a new challenge is created
    event ChallengeCreated(
        uint256 indexed n,
        address indexed challenger,
        address indexed rewardToken,
        uint256 rewardAmount
    );

    /// @notice Event emitted when a challenge is solved
    event ChallengeSolved(
        uint256 indexed n,
        address indexed solver,
        address indexed rewardtoken,
        uint256 rewardAmount,
        uint256 prizePoolAmount
    );

    ///@notice Event emitted when a user withdraws tokens
    event Withdrawn(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 newBalance
    );

    /// @notice Custom errors
    error InvalidAddress(address invalidAddress);
    error InvalidChallenge(uint256 n);
    error InvalidProof();
    error InvalidAmount(uint256 amount);
    error InvalidRewardAmount(uint256 rewardAmount);
    error UnsupportedToken(address tokenAddress);
    error ChallengeAlreadyExists(uint256 n);
    error ChallengeDoesNotExist(uint256 n);
    error ChallengeExpired(uint256 n);
    error ChallengeAlreadySolved(uint256 n);
    error InsufficientBalance(uint256 amount, uint256 balance);
    error ProofForWrongChallenge(uint256 n);
    error NotProvenComposite(uint256 isComposite);

    /**
     * @notice Constructor that initializes the contract with a list of supported token addresses.
     * @param _tokenAddresses An array of token addresses to be marked as supported.
     */
    constructor(address[] memory _tokenAddresses, address _verifierAddress) {
        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            require(
                _tokenAddresses[i] != address(0),
                InvalidAddress(_tokenAddresses[i])
            );
            supportedTokens[_tokenAddresses[i]] = true;
        }
        require(
            _verifierAddress != address(0),
            InvalidAddress(_verifierAddress)
        );
        verifier = IVerifier(_verifierAddress);
    }

    function createChallenge(
        uint256 _n,
        address _rewardToken,
        uint256 _rewardAmount
    ) external {
        require(_n > 1, InvalidChallenge(_n));
        require(_rewardAmount > 0, InvalidRewardAmount(_rewardAmount));
        require(supportedTokens[_rewardToken], UnsupportedToken(_rewardToken));
        require(
            challenges[_n].challenger == address(0),
            ChallengeAlreadyExists(_n)
        );

        IERC20(_rewardToken).safeTransferFrom(
            msg.sender,
            address(this),
            _rewardAmount
        );

        challenges[_n] = Challenge({
            n: _n,
            rewardAmount: _rewardAmount,
            blockNumber: block.number,
            challenger: msg.sender,
            rewardToken: _rewardToken,
            solver: address(0)
        });

        emit ChallengeCreated(_n, msg.sender, _rewardToken, _rewardAmount);
    }

    function solveChallenge(
        uint256 _n,
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[2] calldata _pubSignals
    ) external {
        console.log("_pA[0] in solveChallenge", toHexString(_pA[0]));
        console.log("_pA[1] in solveChallenge", toHexString(_pA[1]));
        console.log("_pB[0][0] in solveChallenge", toHexString(_pB[0][0]));
        console.log("_pB[0][1] in solveChallenge", toHexString(_pB[0][1]));
        console.log("_pB[1][0] in solveChallenge", toHexString(_pB[1][0]));
        console.log("_pB[1][1] in solveChallenge", toHexString(_pB[1][1]));
        console.log("_pC[0] in solveChallenge", toHexString(_pC[0]));
        console.log("_pC[1] in solveChallenge", toHexString(_pC[1]));
        console.log(
            "_pubSignals[0] in solveChallenge",
            toHexString(_pubSignals[0])
        );
        console.log(
            "_pubSignals[1] in solveChallenge",
            toHexString(_pubSignals[1])
        );

        Challenge storage challenge = challenges[_n];
        require(
            challenges[_n].challenger != address(0),
            ChallengeDoesNotExist(_n)
        );
        require(
            block.number <= challenge.blockNumber + T,
            ChallengeExpired(_n)
        );
        require(
            challenges[_n].solver == address(0),
            ChallengeAlreadySolved(_n)
        );

        // print out element 1 of _pubSignals
        console.log("_pubSignals[1] in contract", _pubSignals[1]);
        console.log("_pubSignals[0] in contract", _pubSignals[0]);
        console.log("_n in contract", _n);

        // Check that the proof is for the correct challenge
        require(_n == _pubSignals[1], ProofForWrongChallenge(_n));

        // Verify the proof using the Verifier contract. Verifies the mathematical validity of the proof but doesn't check public inputs
        bool isValidProof = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        console.log("isValidProof", isValidProof); // Debugging output

        require(isValidProof, InvalidProof());

        // Check that the proof determined that n is composite based on the factors (private inputs) provided by the solver
        require(_pubSignals[0] == 1, NotProvenComposite(_pubSignals[0]));

        uint256 halfReward = challenge.rewardAmount / 2;

        prizePools[challenge.rewardToken] += halfReward;
        balances[msg.sender][challenge.rewardToken] += halfReward;

        emit ChallengeSolved(
            _n,
            msg.sender,
            challenge.rewardToken,
            halfReward,
            halfReward
        );
    }

    function withdraw(uint256 _amount, address _tokenAddress) external {
        require(_amount > 0, InvalidAmount(_amount));
        require(
            supportedTokens[_tokenAddress],
            UnsupportedToken(_tokenAddress)
        );
        uint256 balance = balances[msg.sender][_tokenAddress];
        require(balance >= _amount, InsufficientBalance(_amount, balance));

        // Decrement user balance before transferring tokens
        balances[msg.sender][_tokenAddress] -= _amount;
        IERC20(_tokenAddress).safeTransfer(msg.sender, _amount);
        emit Withdrawn(msg.sender, _tokenAddress, _amount, balance - _amount);
    }

    // Convert uint256 to hex string and print
    function toHexString(uint256 value) internal pure returns (string memory) {
        bytes memory buffer = new bytes(2 + 64);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 0; i < 64; i++) {
            buffer[2 + i] = bytes("0123456789abcdef")[
                (value >> (4 * (63 - i))) & 0xf
            ];
        }
        return string(buffer);
    }
}
