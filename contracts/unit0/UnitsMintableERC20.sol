// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "./interfaces/IUnitsMintableERC20.sol";

/**
 * @title UnitsMintableERC20
 * @notice ERC20 token with bridge-controlled minting and burning
 * @dev Compatible with Units Network StandardBridge for cross-layer token representation
 *      Deploy on Unit0 (EL) to represent a WAVES (CL) token
 */
contract UnitsMintableERC20 is ERC20, ERC165, IUnitsMintableERC20 {
    /// @notice Address of the bridge contract that can mint/burn
    address public immutable bridge;

    /// @notice Number of decimals for this token
    uint8 private immutable _decimals;

    /// @notice The WAVES asset ID this token represents
    string public wavesAssetId;

    /// @notice Emitted when tokens are minted
    event Mint(address indexed to, uint256 amount);

    /// @notice Emitted when tokens are burned
    event Burn(address indexed from, uint256 amount);

    /**
     * @notice Restricts function to bridge only
     */
    modifier onlyBridge() {
        require(msg.sender == bridge, "UnitsMintableERC20: only bridge can call");
        _;
    }

    /**
     * @notice Constructor
     * @param _bridge Address of the bridge contract
     * @param _name Token name
     * @param _symbol Token symbol
     * @param decimals_ Token decimals (must be >= WAVES token decimals)
     * @param _wavesAssetId The WAVES asset ID this token represents
     */
    constructor(
        address _bridge,
        string memory _name,
        string memory _symbol,
        uint8 decimals_,
        string memory _wavesAssetId
    ) ERC20(_name, _symbol) {
        require(_bridge != address(0), "UnitsMintableERC20: bridge is zero address");
        bridge = _bridge;
        _decimals = decimals_;
        wavesAssetId = _wavesAssetId;
    }

    /**
     * @notice Returns the number of decimals
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /**
     * @notice Mint tokens to an address (only bridge)
     * @param _to Recipient address
     * @param _amount Amount to mint
     */
    function mint(address _to, uint256 _amount) external override onlyBridge {
        _mint(_to, _amount);
        emit Mint(_to, _amount);
    }

    /**
     * @notice Burn tokens from an address (only bridge)
     * @param _from Address to burn from
     * @param _amount Amount to burn
     */
    function burn(address _from, uint256 _amount) external override onlyBridge {
        _burn(_from, _amount);
        emit Burn(_from, _amount);
    }

    /**
     * @notice Check if contract supports an interface
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
            super.supportsInterface(interfaceId);
    }
}
