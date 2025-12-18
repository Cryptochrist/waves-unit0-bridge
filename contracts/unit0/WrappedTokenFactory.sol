// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IWrappedToken.sol";
import "./WrappedERC20.sol";

/**
 * @title WrappedTokenFactory
 * @notice Factory contract for deploying wrapped token contracts using minimal proxy pattern
 * @dev Uses OpenZeppelin Clones library for gas-efficient deployments
 */
contract WrappedTokenFactory is Ownable {
    /// @notice Implementation contract for ERC20 wrapped tokens
    address public erc20Implementation;

    /// @notice Implementation contract for ERC721 wrapped NFTs
    address public erc721Implementation;

    /// @notice The bridge contract address (has permission to create wrapped tokens)
    address public bridge;

    /// @notice Mapping from WAVES asset ID to wrapped token address
    mapping(string => address) public wavesAssetToWrapped;

    /// @notice Mapping from wrapped token address to WAVES asset ID
    mapping(address => string) public wrappedToWavesAsset;

    /// @notice Array of all deployed wrapped tokens
    address[] public deployedTokens;

    // Events
    event WrappedTokenCreated(
        string indexed wavesAssetIdHash,
        string wavesAssetId,
        address indexed wrappedToken,
        string name,
        string symbol,
        uint8 decimals
    );

    event WrappedNFTCreated(
        string indexed wavesAssetIdHash,
        string wavesAssetId,
        address indexed wrappedNFT,
        string name,
        string symbol
    );

    event BridgeUpdated(address indexed oldBridge, address indexed newBridge);
    event ImplementationUpdated(string tokenType, address indexed newImplementation);

    /**
     * @notice Constructor
     * @param _erc20Implementation Address of the ERC20 implementation contract
     */
    constructor(address _erc20Implementation) Ownable(msg.sender) {
        require(_erc20Implementation != address(0), "Invalid ERC20 implementation");
        erc20Implementation = _erc20Implementation;
    }

    /**
     * @notice Set the bridge contract address
     * @param _bridge Address of the bridge contract
     */
    function setBridge(address _bridge) external onlyOwner {
        require(_bridge != address(0), "Invalid bridge address");
        emit BridgeUpdated(bridge, _bridge);
        bridge = _bridge;
    }

    /**
     * @notice Set the ERC20 implementation contract
     * @param _implementation Address of the new implementation
     */
    function setERC20Implementation(address _implementation) external onlyOwner {
        require(_implementation != address(0), "Invalid implementation");
        erc20Implementation = _implementation;
        emit ImplementationUpdated("ERC20", _implementation);
    }

    /**
     * @notice Set the ERC721 implementation contract
     * @param _implementation Address of the new implementation
     */
    function setERC721Implementation(address _implementation) external onlyOwner {
        require(_implementation != address(0), "Invalid implementation");
        erc721Implementation = _implementation;
        emit ImplementationUpdated("ERC721", _implementation);
    }

    /**
     * @notice Create a new wrapped ERC20 token for a WAVES asset
     * @param wavesAssetId The WAVES asset ID
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals Token decimals
     * @return wrappedToken Address of the deployed wrapped token
     */
    function createWrappedERC20(
        string calldata wavesAssetId,
        string calldata name,
        string calldata symbol,
        uint8 decimals
    ) external returns (address wrappedToken) {
        require(msg.sender == bridge || msg.sender == owner(), "Unauthorized");
        require(wavesAssetToWrapped[wavesAssetId] == address(0), "Token already exists");
        require(bytes(wavesAssetId).length > 0, "Invalid WAVES asset ID");
        require(erc20Implementation != address(0), "ERC20 implementation not set");

        // Deploy clone
        wrappedToken = Clones.clone(erc20Implementation);

        // Initialize the token
        IWrappedToken(wrappedToken).initialize(name, symbol, decimals, bridge);

        // Set the WAVES asset ID
        WrappedERC20(wrappedToken).setWavesAssetId(wavesAssetId);

        // Store mappings
        wavesAssetToWrapped[wavesAssetId] = wrappedToken;
        wrappedToWavesAsset[wrappedToken] = wavesAssetId;
        deployedTokens.push(wrappedToken);

        emit WrappedTokenCreated(
            wavesAssetId,
            wavesAssetId,
            wrappedToken,
            name,
            symbol,
            decimals
        );
    }

    /**
     * @notice Get the wrapped token address for a WAVES asset
     * @param wavesAssetId The WAVES asset ID
     * @return The wrapped token address (or address(0) if not found)
     */
    function getWrappedToken(string calldata wavesAssetId) external view returns (address) {
        return wavesAssetToWrapped[wavesAssetId];
    }

    /**
     * @notice Get the WAVES asset ID for a wrapped token
     * @param wrappedToken The wrapped token address
     * @return The WAVES asset ID (or empty string if not found)
     */
    function getWavesAssetId(address wrappedToken) external view returns (string memory) {
        return wrappedToWavesAsset[wrappedToken];
    }

    /**
     * @notice Check if a wrapped token exists for a WAVES asset
     * @param wavesAssetId The WAVES asset ID
     * @return True if wrapped token exists
     */
    function wrappedTokenExists(string calldata wavesAssetId) external view returns (bool) {
        return wavesAssetToWrapped[wavesAssetId] != address(0);
    }

    /**
     * @notice Get the total number of deployed wrapped tokens
     * @return The count of deployed tokens
     */
    function getDeployedTokensCount() external view returns (uint256) {
        return deployedTokens.length;
    }

    /**
     * @notice Get deployed tokens with pagination
     * @param offset Starting index
     * @param limit Maximum number of tokens to return
     * @return tokens Array of token addresses
     */
    function getDeployedTokens(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory tokens)
    {
        uint256 total = deployedTokens.length;
        if (offset >= total) {
            return new address[](0);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        tokens = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            tokens[i - offset] = deployedTokens[i];
        }
    }
}
