// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IVerifier} from "./IVerfier.sol";

/**
 * @title CompositeNumberGame
 * @notice A contract that allows users to create and solve challenges for composite numbers.
 * @author Heather Swope
 */
contract CompositeNumberGame is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Struct to store challenge details
    struct Challenge {
        uint256 n;
        uint256 rewardAmount;
        uint256 blockNumber;
        address challenger;
        address rewardToken;
        address solver;
    }

    /// @notice Timeframe in blocks
    uint256 public constant T = 10;

    /// @notice Verifier contract interface
    IVerifier public verifier;

    /// @notice Mapping to store supported tokens by token address
    mapping(address => bool) public supportedTokens;

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

    event ExpiredChallengeClaimed(
        uint256 indexed n,
        address indexed challenger,
        address indexed rewardtoken,
        uint256 rewardAmount,
        uint256 prizePoolAmount
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
    error ChallengeNotExpired(uint256 n);
    error ChallengeAlreadySolved(uint256 n);
    error InsufficientBalance(uint256 amount, uint256 balance);
    error ProofNotForN(uint256 n);
    error NotComposite(uint256 isComposite);
    error UnauthorizedChallenger(address challenger);

    modifier onlyChallenger(uint256 _n) {
        require(
            challenges[_n].challenger == msg.sender,
            UnauthorizedChallenger(msg.sender)
        );
        _;
    }

    /**
     * @notice Constructor that initializes the contract with a list of supported token addresses.
     * @param _tokenAddresses An array of token addresses to be marked as supported.
     */
    constructor(address[] memory _tokenAddresses, address _verifierAddress) {
        require(
            _verifierAddress != address(0),
            InvalidAddress(_verifierAddress)
        );

        verifier = IVerifier(_verifierAddress);

        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            require(
                _tokenAddresses[i] != address(0),
                InvalidAddress(_tokenAddresses[i])
            );
            supportedTokens[_tokenAddresses[i]] = true;
        }
    }

    /**
     * @notice Creates a new challenge with a reward amount for a given composite number.
     * @dev The reward amount is transferred to the contract and the challenge is created.
     * The challenger must provide a proof that the _n is composite.
     * @param _n The composite number to be challenged.
     * @param _rewardToken The address of the token to be used as reward.
     * @param _rewardAmount The amount of tokens to be used as reward.
     * @param _pA The proof A array.
     * @param _pB The proof B array.
     * @param _pC The proof C array.
     * @param _pubSignals The public signals array.
     */
    function createChallenge(
        uint256 _n,
        address _rewardToken,
        uint256 _rewardAmount,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[2] calldata _pubSignals
    ) external nonReentrant {
        require(_rewardAmount > 0, InvalidRewardAmount(_rewardAmount));
        require(supportedTokens[_rewardToken], UnsupportedToken(_rewardToken));
        require(
            challenges[_n].challenger == address(0),
            ChallengeAlreadyExists(_n)
        );

        // Check that the submitted proof is for _n. The input signal _n is in the second element
        require(_n == _pubSignals[1], ProofNotForN(_n));

        // Verify the proof using the Verifier contract. Verifies the mathematical validity of the proof but doesn't check public inputs
        bool isValidProof = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        require(isValidProof, InvalidProof());

        // Check that the proof determined that _n is composite based on the factors (private inputs signals) provided by the challenger
        // The output signal isComposite is in the first element
        require(_pubSignals[0] == 1, NotComposite(_pubSignals[0]));

        // Transfer the reward amount to the contract
        IERC20(_rewardToken).safeTransferFrom(
            msg.sender,
            address(this),
            _rewardAmount
        );

        // Create the challenge
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

    /**
     * @notice Allows caller to solve a challenge by providing a proof that _n is a composite number.
     * @dev The challenger must provide a proof that _n is composite.
     * @param _n The composite number to be challenged.
     * @param _pA The proof A array.
     * @param _pB The proof B array.
     * @param _pC The proof C array.
     * @param _pubSignals The public signals array.
     */
    function solveChallenge(
        uint256 _n,
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[2] calldata _pubSignals
    ) external {
        Challenge memory challenge = challenges[_n];
        require(challenge.challenger != address(0), ChallengeDoesNotExist(_n));
        require(
            block.number <= challenge.blockNumber + T,
            ChallengeExpired(_n)
        );
        require(challenge.solver == address(0), ChallengeAlreadySolved(_n));

        // Check that the submitted proof is for _n. The input signal _n is in the second element
        require(_n == _pubSignals[1], ProofNotForN(_n));

        // Verify the proof using the Verifier contract. Verifies the mathematical validity of the proof but doesn't check public inputs
        bool isValidProof = verifier.verifyProof(_pA, _pB, _pC, _pubSignals);
        require(isValidProof, InvalidProof());

        // Check that the proof determined that _n is composite based on the factors (private inputs) provided by the solver
        // The output signal isComposite is in the first element
        require(_pubSignals[0] == 1, NotComposite(_pubSignals[0]));

        uint256 halfReward = challenge.rewardAmount / 2;

        prizePools[challenge.rewardToken] += halfReward;
        balances[msg.sender][challenge.rewardToken] += halfReward;

        challenges[_n].solver = msg.sender;

        emit ChallengeSolved(
            _n,
            msg.sender,
            challenge.rewardToken,
            halfReward,
            halfReward
        );
    }

    function claimExpiredChallenge(uint256 _n) external onlyChallenger(_n) {
        Challenge memory challenge = challenges[_n];
        require(challenge.challenger != address(0), ChallengeDoesNotExist(_n));
        require(
            block.number > challenge.blockNumber + T,
            ChallengeNotExpired(_n)
        );
        require(challenge.solver == address(0), ChallengeAlreadySolved(_n));

        uint256 rewardAmount = challenge.rewardAmount;
        uint256 prizePoolReward = prizePools[challenge.rewardToken] / 2;

        prizePools[challenge.rewardToken] -= prizePoolReward;
        balances[challenge.challenger][challenge.rewardToken] +=
            rewardAmount +
            prizePoolReward;

        delete challenges[_n];

        emit ExpiredChallengeClaimed(
            _n,
            challenge.challenger,
            challenge.rewardToken,
            rewardAmount,
            prizePoolReward
        );
    }

    /**
     * @notice Withdraws an amount of the specified token from the caller's balance in the contract.
     * @param _amount The amount of tokens to withdraw.
     * @param _tokenAddress The address of the token to withdraw.
     */
    function withdraw(uint256 _amount, address _tokenAddress) external nonReentrant {
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
}
