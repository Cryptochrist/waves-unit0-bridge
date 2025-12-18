// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IWrappedToken
 * @notice Interface for wrapped tokens that can be minted/burned by the bridge
 */
interface IWrappedToken is IERC20 {
    /**
     * @notice Initialize the wrapped token
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals Token decimals
     * @param bridge Address of the bridge contract (has mint/burn rights)
     */
    function initialize(
        string memory name,
        string memory symbol,
        uint8 decimals,
        address bridge
    ) external;

    /**
     * @notice Mint tokens to an address (only callable by bridge)
     * @param to Recipient address
     * @param amount Amount to mint
     */
    function mint(address to, uint256 amount) external;

    /**
     * @notice Burn tokens from an address (only callable by bridge)
     * @param from Address to burn from
     * @param amount Amount to burn
     */
    function burn(address from, uint256 amount) external;

    /**
     * @notice Get the original WAVES asset ID this token represents
     */
    function wavesAssetId() external view returns (string memory);

    /**
     * @notice Get the bridge address
     */
    function bridge() external view returns (address);
}
