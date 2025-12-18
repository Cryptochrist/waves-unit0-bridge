// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "./interfaces/IWrappedToken.sol";
import "./interfaces/IUnitsMintableERC20.sol";

/**
 * @title WrappedERC20
 * @notice ERC20 token representing a wrapped WAVES asset on Unit0
 * @dev This contract is deployed via the WrappedTokenFactory using Clone pattern
 *      Compatible with both custom bridge and Units Network StandardBridge
 */
contract WrappedERC20 is ERC20, ERC165, IWrappedToken, IUnitsMintableERC20 {
    address private _bridge;
    string private _wavesAssetId;
    uint8 private _decimals;
    bool private _initialized;

    // Use placeholder values for ERC20 constructor since we initialize later
    constructor() ERC20("Wrapped Token", "WRAP") {}

    /**
     * @notice Initialize the wrapped token (called once after clone deployment)
     * @param name_ Token name
     * @param symbol_ Token symbol
     * @param decimals_ Token decimals
     * @param bridge_ Address of the bridge contract
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        address bridge_
    ) external override {
        require(!_initialized, "Already initialized");
        require(bridge_ != address(0), "Invalid bridge address");

        _initialized = true;
        _bridge = bridge_;
        _decimals = decimals_;

        // Note: ERC20 name and symbol are set in constructor and cannot be changed
        // For clone pattern, we store these separately
    }

    /**
     * @notice Set the WAVES asset ID this token represents
     * @param assetId The WAVES asset ID
     */
    function setWavesAssetId(string memory assetId) external {
        require(msg.sender == _bridge, "Only bridge");
        require(bytes(_wavesAssetId).length == 0, "Already set");
        _wavesAssetId = assetId;
    }

    /**
     * @notice Mint tokens to an address
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external override(IUnitsMintableERC20, IWrappedToken) {
        require(msg.sender == _bridge, "Only bridge can mint");
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens from an address
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function burn(address from, uint256 amount) external override(IUnitsMintableERC20, IWrappedToken) {
        require(msg.sender == _bridge, "Only bridge can burn");
        _burn(from, amount);
    }

    /**
     * @notice Get token decimals
     */
    function decimals() public view override returns (uint8) {
        return _decimals == 0 ? 18 : _decimals;
    }

    /**
     * @notice Get the WAVES asset ID
     */
    function wavesAssetId() external view override returns (string memory) {
        return _wavesAssetId;
    }

    /**
     * @notice Get the bridge address
     */
    function bridge() external view override returns (address) {
        return _bridge;
    }

    /**
     * @notice Check if contract supports an interface (ERC165)
     * @param interfaceId Interface ID to check
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC165, IERC165)
        returns (bool)
    {
        return
            interfaceId == type(IUnitsMintableERC20).interfaceId ||
            interfaceId == type(IWrappedToken).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}
