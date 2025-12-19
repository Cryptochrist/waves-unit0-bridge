// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "./interfaces/IWrappedToken.sol";
import "./interfaces/IWrappedNFT.sol";
import "./WrappedTokenFactory.sol";

/**
 * @title WavesUnit0Bridge
 * @notice Decentralized bridge for transferring custom tokens between WAVES and Unit0
 * @dev Uses M-of-N multisig validation from a set of validators
 */
contract WavesUnit0Bridge is ReentrancyGuard, Pausable, Ownable {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    // ============ Enums ============

    enum TokenType {
        ERC20,
        ERC721,
        ERC1155,
        NATIVE
    }

    // ============ Structs ============

    struct Validator {
        bool isActive;
        uint256 addedAt;
        uint256 removedAt;
    }

    struct LockInfo {
        address token;
        uint256 amount;
        address sender;
        string wavesDestination;
        uint256 timestamp;
        uint256 nonce;
        TokenType tokenType;
        uint256 tokenId;
        bool exists;
    }

    struct TokenInfo {
        string wavesAssetId;
        bool isNative; // True if originated on Unit0
        uint8 wavesDecimals;
        uint8 unit0Decimals;
        bool isActive;
        bool isWrapped; // True if this is a wrapped WAVES token
    }

    // ============ State Variables ============

    /// @notice Mapping of validator addresses to their info
    mapping(address => Validator) public validators;

    /// @notice Array of all validator addresses
    address[] public validatorList;

    /// @notice Number of active validators
    uint256 public activeValidatorCount;

    /// @notice Required number of signatures (M of N)
    uint256 public validatorThreshold;

    /// @notice Processed transfer IDs (prevents replay)
    mapping(bytes32 => bool) public processedTransfers;

    /// @notice Pending lock information
    mapping(bytes32 => LockInfo) public pendingLocks;

    /// @notice Token registry: Unit0 address -> info
    mapping(address => TokenInfo) public tokenRegistry;

    /// @notice WAVES asset ID -> Unit0 token address
    mapping(string => address) public wavesToUnit0Token;

    /// @notice Outbound transfer nonce
    uint256 public outboundNonce;

    /// @notice Bridge fee in basis points (100 = 1%)
    uint256 public bridgeFeePercent;

    /// @notice Validator fee in basis points
    uint256 public validatorFeePercent;

    /// @notice Treasury address for fees
    address public treasury;

    /// @notice Wrapped token factory
    WrappedTokenFactory public tokenFactory;

    /// @notice Daily transfer limits per token
    mapping(address => uint256) public dailyLimit;
    mapping(address => uint256) public dailyTransferred;
    mapping(address => uint256) public lastResetDay;

    /// @notice Per-token pause status
    mapping(address => bool) public tokenPaused;

    // ============ Events ============

    event TokensLocked(
        bytes32 indexed lockId,
        address indexed token,
        uint256 amount,
        address indexed sender,
        string wavesDestination,
        uint256 nonce,
        TokenType tokenType,
        uint256 tokenId
    );

    event TokensReleased(
        bytes32 indexed wavesTransferId,
        address indexed token,
        uint256 amount,
        address indexed recipient,
        TokenType tokenType,
        uint256 tokenId
    );

    event ValidatorAdded(address indexed validator);
    event ValidatorRemoved(address indexed validator);
    event ValidatorThresholdUpdated(uint256 oldThreshold, uint256 newThreshold);
    event TokenRegistered(address indexed unit0Token, string wavesAssetId, bool isNative);
    event TokenPausedEvent(address indexed token, bool paused);
    event DailyLimitUpdated(address indexed token, uint256 newLimit);
    event FeesUpdated(uint256 bridgeFee, uint256 validatorFee);
    event TreasuryUpdated(address indexed newTreasury);
    event BridgePaused(address indexed by, uint256 timestamp);
    event BridgeUnpaused(address indexed by, uint256 timestamp);

    // ============ Modifiers ============

    modifier tokenNotPaused(address token) {
        require(!tokenPaused[token], "Token is paused");
        _;
    }

    // ============ Constructor ============

    /**
     * @notice Initialize the bridge contract
     * @param _treasury Treasury address for fees
     * @param _tokenFactory Wrapped token factory address
     * @param _threshold Initial validator threshold
     */
    constructor(
        address _treasury,
        address _tokenFactory,
        uint256 _threshold
    ) Ownable(msg.sender) {
        require(_treasury != address(0), "Invalid treasury");
        require(_tokenFactory != address(0), "Invalid factory");
        require(_threshold > 0, "Invalid threshold");

        treasury = _treasury;
        tokenFactory = WrappedTokenFactory(_tokenFactory);
        validatorThreshold = _threshold;
        bridgeFeePercent = 10; // 0.1%
        validatorFeePercent = 5; // 0.05%
    }

    // ============ Validator Management ============

    /**
     * @notice Add a new validator
     * @param validator Address of the validator to add
     */
    function addValidator(address validator) external onlyOwner {
        require(validator != address(0), "Invalid address");
        require(!validators[validator].isActive, "Already active");

        validators[validator] = Validator({
            isActive: true,
            addedAt: block.timestamp,
            removedAt: 0
        });

        validatorList.push(validator);
        activeValidatorCount++;

        emit ValidatorAdded(validator);
    }

    /**
     * @notice Remove a validator
     * @param validator Address of the validator to remove
     */
    function removeValidator(address validator) external onlyOwner {
        require(validators[validator].isActive, "Not active");
        require(activeValidatorCount > validatorThreshold, "Would break threshold");

        validators[validator].isActive = false;
        validators[validator].removedAt = block.timestamp;
        activeValidatorCount--;

        emit ValidatorRemoved(validator);
    }

    /**
     * @notice Update the validator threshold
     * @param newThreshold New threshold value
     */
    function setValidatorThreshold(uint256 newThreshold) external onlyOwner {
        require(newThreshold > 0, "Invalid threshold");
        require(newThreshold <= activeValidatorCount, "Threshold exceeds validators");

        emit ValidatorThresholdUpdated(validatorThreshold, newThreshold);
        validatorThreshold = newThreshold;
    }

    // ============ Token Management ============

    /**
     * @notice Register a native Unit0 token for bridging
     * @param token Token address
     * @param wavesAssetId Corresponding WAVES asset ID
     * @param wavesDecimals Decimals on WAVES side
     */
    function registerNativeToken(
        address token,
        string calldata wavesAssetId,
        uint8 wavesDecimals
    ) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(bytes(wavesAssetId).length > 0, "Invalid WAVES asset ID");
        require(wavesToUnit0Token[wavesAssetId] == address(0), "Already registered");

        uint8 unit0Decimals = 18; // Default for most ERC20
        try IERC20Metadata(token).decimals() returns (uint8 dec) {
            unit0Decimals = dec;
        } catch {}

        tokenRegistry[token] = TokenInfo({
            wavesAssetId: wavesAssetId,
            isNative: true,
            wavesDecimals: wavesDecimals,
            unit0Decimals: unit0Decimals,
            isActive: true,
            isWrapped: false
        });

        wavesToUnit0Token[wavesAssetId] = token;

        emit TokenRegistered(token, wavesAssetId, true);
    }

    /**
     * @notice Create and register a wrapped token for a WAVES asset (owner only)
     * @param wavesAssetId WAVES asset ID
     * @param name Token name
     * @param symbol Token symbol
     * @param wavesDecimals Decimals on WAVES
     * @param unit0Decimals Decimals for Unit0 wrapped token
     */
    function createWrappedToken(
        string calldata wavesAssetId,
        string calldata name,
        string calldata symbol,
        uint8 wavesDecimals,
        uint8 unit0Decimals
    ) external onlyOwner returns (address wrappedToken) {
        return _createWrappedToken(wavesAssetId, name, symbol, wavesDecimals, unit0Decimals);
    }

    /**
     * @notice Permissionless token registration - anyone can register a WAVES token
     * @param wavesAssetId WAVES asset ID
     * @param name Token name
     * @param symbol Token symbol
     * @param wavesDecimals Decimals on WAVES
     * @param unit0Decimals Decimals for Unit0 wrapped token
     */
    function registerToken(
        string calldata wavesAssetId,
        string calldata name,
        string calldata symbol,
        uint8 wavesDecimals,
        uint8 unit0Decimals
    ) external returns (address wrappedToken) {
        return _createWrappedToken(wavesAssetId, name, symbol, wavesDecimals, unit0Decimals);
    }

    /**
     * @notice Internal function to create wrapped token
     */
    function _createWrappedToken(
        string calldata wavesAssetId,
        string calldata name,
        string calldata symbol,
        uint8 wavesDecimals,
        uint8 unit0Decimals
    ) internal returns (address wrappedToken) {
        require(wavesToUnit0Token[wavesAssetId] == address(0), "Already registered");

        // Create wrapped token via factory
        wrappedToken = tokenFactory.createWrappedERC20(
            wavesAssetId,
            name,
            symbol,
            unit0Decimals
        );

        tokenRegistry[wrappedToken] = TokenInfo({
            wavesAssetId: wavesAssetId,
            isNative: false,
            wavesDecimals: wavesDecimals,
            unit0Decimals: unit0Decimals,
            isActive: true,
            isWrapped: true
        });

        wavesToUnit0Token[wavesAssetId] = wrappedToken;

        emit TokenRegistered(wrappedToken, wavesAssetId, false);
    }

    /**
     * @notice Set daily transfer limit for a token
     * @param token Token address
     * @param limit Daily limit amount
     */
    function setDailyLimit(address token, uint256 limit) external onlyOwner {
        dailyLimit[token] = limit;
        emit DailyLimitUpdated(token, limit);
    }

    /**
     * @notice Pause/unpause a specific token
     * @param token Token address
     * @param paused Pause status
     */
    function setTokenPaused(address token, bool paused) external onlyOwner {
        tokenPaused[token] = paused;
        emit TokenPausedEvent(token, paused);
    }

    /**
     * @notice Update wrapped token metadata (for fixing tokens with missing name/symbol)
     * @param token Wrapped token address
     * @param name_ New token name
     * @param symbol_ New token symbol
     */
    function setWrappedTokenMetadata(
        address token,
        string calldata name_,
        string calldata symbol_
    ) external onlyOwner {
        require(tokenRegistry[token].isWrapped, "Not a wrapped token");
        IWrappedToken(token).setTokenMetadata(name_, symbol_);
    }

    // ============ Lock Functions (Unit0 -> WAVES) ============

    /**
     * @notice Lock ERC20 tokens for bridging to WAVES
     * @param token Token address
     * @param amount Amount to bridge
     * @param wavesDestination WAVES recipient address
     * @return lockId The unique lock identifier
     */
    function lockERC20(
        address token,
        uint256 amount,
        string calldata wavesDestination
    )
        external
        nonReentrant
        whenNotPaused
        tokenNotPaused(token)
        returns (bytes32 lockId)
    {
        require(amount > 0, "Amount must be positive");
        require(bytes(wavesDestination).length >= 35, "Invalid WAVES address");
        require(tokenRegistry[token].isActive, "Token not registered");

        // Check daily limit
        _checkAndUpdateDailyLimit(token, amount);

        // Calculate fees
        uint256 bridgeFee = (amount * bridgeFeePercent) / 10000;
        uint256 validatorFee = (amount * validatorFeePercent) / 10000;
        uint256 netAmount = amount - bridgeFee - validatorFee;

        // Transfer tokens
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Transfer fees to treasury
        if (bridgeFee + validatorFee > 0) {
            IERC20(token).safeTransfer(treasury, bridgeFee + validatorFee);
        }

        // If wrapped token, burn it
        if (tokenRegistry[token].isWrapped) {
            IWrappedToken(token).burn(address(this), netAmount);
        }

        // Generate lock ID
        lockId = keccak256(
            abi.encodePacked(
                block.chainid,
                token,
                netAmount,
                msg.sender,
                wavesDestination,
                outboundNonce
            )
        );

        // Store lock info
        pendingLocks[lockId] = LockInfo({
            token: token,
            amount: netAmount,
            sender: msg.sender,
            wavesDestination: wavesDestination,
            timestamp: block.timestamp,
            nonce: outboundNonce,
            tokenType: TokenType.ERC20,
            tokenId: 0,
            exists: true
        });

        outboundNonce++;

        emit TokensLocked(
            lockId,
            token,
            netAmount,
            msg.sender,
            wavesDestination,
            outboundNonce - 1,
            TokenType.ERC20,
            0
        );
    }

    /**
     * @notice Lock native UNIT0 for bridging to WAVES
     * @param wavesDestination WAVES recipient address
     * @return lockId The unique lock identifier
     */
    function lockNative(string calldata wavesDestination)
        external
        payable
        nonReentrant
        whenNotPaused
        returns (bytes32 lockId)
    {
        require(msg.value > 0, "Amount must be positive");
        require(bytes(wavesDestination).length >= 35, "Invalid WAVES address");

        // Calculate fees
        uint256 bridgeFee = (msg.value * bridgeFeePercent) / 10000;
        uint256 validatorFee = (msg.value * validatorFeePercent) / 10000;
        uint256 netAmount = msg.value - bridgeFee - validatorFee;

        // Transfer fees to treasury
        if (bridgeFee + validatorFee > 0) {
            (bool success, ) = treasury.call{value: bridgeFee + validatorFee}("");
            require(success, "Fee transfer failed");
        }

        // Generate lock ID
        lockId = keccak256(
            abi.encodePacked(
                block.chainid,
                address(0), // Native token
                netAmount,
                msg.sender,
                wavesDestination,
                outboundNonce
            )
        );

        // Store lock info
        pendingLocks[lockId] = LockInfo({
            token: address(0),
            amount: netAmount,
            sender: msg.sender,
            wavesDestination: wavesDestination,
            timestamp: block.timestamp,
            nonce: outboundNonce,
            tokenType: TokenType.NATIVE,
            tokenId: 0,
            exists: true
        });

        outboundNonce++;

        emit TokensLocked(
            lockId,
            address(0),
            netAmount,
            msg.sender,
            wavesDestination,
            outboundNonce - 1,
            TokenType.NATIVE,
            0
        );
    }

    // ============ Release Functions (WAVES -> Unit0) ============

    /**
     * @notice Release tokens from WAVES (requires validator signatures)
     * @param wavesTransferId Transfer ID from WAVES
     * @param token Token address on Unit0
     * @param amount Amount to release
     * @param recipient Recipient address
     * @param tokenType Type of token
     * @param tokenId Token ID (for NFTs)
     * @param signatures Array of validator signatures
     */
    function releaseTokens(
        bytes32 wavesTransferId,
        address token,
        uint256 amount,
        address recipient,
        TokenType tokenType,
        uint256 tokenId,
        bytes[] calldata signatures
    ) external nonReentrant whenNotPaused {
        require(!processedTransfers[wavesTransferId], "Already processed");
        require(signatures.length >= validatorThreshold, "Insufficient signatures");
        require(recipient != address(0), "Invalid recipient");

        // Create message hash
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                wavesTransferId,
                token,
                amount,
                recipient,
                tokenType,
                tokenId,
                block.chainid
            )
        );

        // Verify signatures
        _verifySignatures(messageHash, signatures);

        // Mark as processed
        processedTransfers[wavesTransferId] = true;

        // Release tokens based on type
        if (tokenType == TokenType.ERC20) {
            _releaseERC20(token, amount, recipient);
        } else if (tokenType == TokenType.NATIVE) {
            _releaseNative(amount, recipient);
        } else if (tokenType == TokenType.ERC721) {
            _releaseERC721(token, tokenId, recipient);
        }

        emit TokensReleased(
            wavesTransferId,
            token,
            amount,
            recipient,
            tokenType,
            tokenId
        );
    }

    /**
     * @notice Internal function to release ERC20 tokens
     */
    function _releaseERC20(address token, uint256 amount, address recipient) internal {
        if (tokenRegistry[token].isWrapped) {
            // Mint wrapped tokens
            IWrappedToken(token).mint(recipient, amount);
        } else {
            // Transfer from bridge reserves
            IERC20(token).safeTransfer(recipient, amount);
        }
    }

    /**
     * @notice Internal function to release native tokens
     */
    function _releaseNative(uint256 amount, address recipient) internal {
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Native transfer failed");
    }

    /**
     * @notice Internal function to release ERC721 tokens
     */
    function _releaseERC721(address token, uint256 tokenId, address recipient) internal {
        if (tokenRegistry[token].isWrapped) {
            // Mint wrapped NFT
            IWrappedNFT(token).mint(recipient, tokenId);
        } else {
            // Transfer from bridge reserves
            IERC721(token).transferFrom(address(this), recipient, tokenId);
        }
    }

    // ============ Signature Verification ============

    /**
     * @notice Verify M-of-N validator signatures
     * @param messageHash The message hash that was signed
     * @param signatures Array of signatures
     */
    function _verifySignatures(bytes32 messageHash, bytes[] calldata signatures) internal view {
        bytes32 ethSignedHash = messageHash.toEthSignedMessageHash();

        uint256 validSignatures = 0;
        address lastSigner = address(0);

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = ethSignedHash.recover(signatures[i]);

            // Ensure signers are sorted (prevents duplicates)
            require(signer > lastSigner, "Signers not sorted or duplicate");
            require(validators[signer].isActive, "Invalid validator");

            lastSigner = signer;
            validSignatures++;
        }

        require(validSignatures >= validatorThreshold, "Threshold not met");
    }

    // ============ Daily Limit Management ============

    /**
     * @notice Check and update daily transfer limit
     */
    function _checkAndUpdateDailyLimit(address token, uint256 amount) internal {
        if (dailyLimit[token] == 0) return; // No limit set

        uint256 today = block.timestamp / 1 days;
        if (lastResetDay[token] < today) {
            dailyTransferred[token] = 0;
            lastResetDay[token] = today;
        }

        require(
            dailyTransferred[token] + amount <= dailyLimit[token],
            "Daily limit exceeded"
        );
        dailyTransferred[token] += amount;
    }

    // ============ Admin Functions ============

    /**
     * @notice Update fee percentages
     * @param _bridgeFee Bridge fee in basis points
     * @param _validatorFee Validator fee in basis points
     */
    function setFees(uint256 _bridgeFee, uint256 _validatorFee) external onlyOwner {
        require(_bridgeFee + _validatorFee <= 1000, "Fees too high"); // Max 10%
        bridgeFeePercent = _bridgeFee;
        validatorFeePercent = _validatorFee;
        emit FeesUpdated(_bridgeFee, _validatorFee);
    }

    /**
     * @notice Update treasury address
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    /**
     * @notice Pause the bridge
     */
    function pause() external onlyOwner {
        _pause();
        emit BridgePaused(msg.sender, block.timestamp);
    }

    /**
     * @notice Unpause the bridge
     */
    function unpause() external onlyOwner {
        _unpause();
        emit BridgeUnpaused(msg.sender, block.timestamp);
    }

    /**
     * @notice Emergency withdraw function (only owner, when paused)
     * @param token Token address (address(0) for native)
     * @param amount Amount to withdraw
     * @param to Recipient address
     */
    function emergencyWithdraw(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner whenPaused {
        require(to != address(0), "Invalid recipient");

        if (token == address(0)) {
            (bool success, ) = to.call{value: amount}("");
            require(success, "Transfer failed");
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    // ============ View Functions ============

    /**
     * @notice Get all active validators
     * @return Array of active validator addresses
     */
    function getActiveValidators() external view returns (address[] memory) {
        address[] memory active = new address[](activeValidatorCount);
        uint256 index = 0;

        for (uint256 i = 0; i < validatorList.length; i++) {
            if (validators[validatorList[i]].isActive) {
                active[index] = validatorList[i];
                index++;
            }
        }

        return active;
    }

    /**
     * @notice Check if a transfer has been processed
     * @param transferId The transfer ID
     * @return True if processed
     */
    function isTransferProcessed(bytes32 transferId) external view returns (bool) {
        return processedTransfers[transferId];
    }

    /**
     * @notice Get lock info
     * @param lockId The lock ID
     * @return Lock information
     */
    function getLockInfo(bytes32 lockId) external view returns (LockInfo memory) {
        return pendingLocks[lockId];
    }

    /**
     * @notice Calculate fees for a transfer amount
     * @param amount The transfer amount
     * @return bridgeFee The bridge fee
     * @return validatorFee The validator fee
     * @return netAmount The amount after fees
     */
    function calculateFees(uint256 amount)
        external
        view
        returns (uint256 bridgeFee, uint256 validatorFee, uint256 netAmount)
    {
        bridgeFee = (amount * bridgeFeePercent) / 10000;
        validatorFee = (amount * validatorFeePercent) / 10000;
        netAmount = amount - bridgeFee - validatorFee;
    }

    // ============ Receive Function ============

    receive() external payable {}
}
