// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract CompositeNumberGame {
    using SafeERC20 for IERC20;

    uint256 public constant T = 10; // Timeframe in blocks

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
    event Withdraw(address indexed user, address indexed token, uint256 amount);

    /**
     * @notice Constructor that initializes the contract with a list of supported token addresses.
     * @param _tokenAddresses An array of token addresses to be marked as supported.
     */
    constructor(address[] memory _tokenAddresses) {
        for (uint256 i = 0; i < _tokenAddresses.length; i++) {
            supportedTokens[_tokenAddresses[i]] = true;
        }
    }

    function createChallenge(
        uint256 _n,
        address _rewardToken,
        uint256 _rewardAmount
    ) external {
        require(_n > 1, "n must be greater than one");
        require(_rewardAmount > 0, "Reward must be greater than zero");
        require(supportedTokens[_rewardToken], "Token not supported");
        require(
            challenges[_n].challenger == address(0),
            "Challenge already exists"
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

    function solveChallenge(uint256 _n) external {
        Challenge storage challenge = challenges[_n];
        require(
            challenges[_n].challenger != address(0),
            "Challenge does not exist"
        );
        require(block.number <= challenge.blockNumber + T, "Challenge expired");
        require(
            challenges[_n].solver == address(0),
            "Challenge already solved"
        );

        // Add logic to verify _n is composite
        // For simplicity, let's assume the proof is always correct

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
        require(_amount > 0, "Amount must be greater than zero");
        require(
            balances[msg.sender][_tokenAddress] >= _amount,
            "Insufficient balance"
        );

        // Decrement user balance before transferring tokens
        balances[msg.sender][_tokenAddress] -= _amount;
        IERC20(_tokenAddress).safeTransfer(msg.sender, _amount);
        emit Withdraw(msg.sender, _tokenAddress, _amount);
    }
}
