// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title IUnitsMintableERC20
 * @notice Interface required for tokens to be bridgeable via Units Network StandardBridge
 * @dev This interface is available on the UnitsMintableERC20 contract.
 *      We declare it as a separate interface so that it can be used in
 *      custom implementations of UnitsMintableERC20.
 */
interface IUnitsMintableERC20 is IERC165 {
    /**
     * @notice Mint tokens to an address (only callable by bridge)
     * @param _to Recipient address
     * @param _amount Amount to mint
     */
    function mint(address _to, uint256 _amount) external;

    /**
     * @notice Burn tokens from an address (only callable by bridge)
     * @param _from Address to burn from
     * @param _amount Amount to burn
     */
    function burn(address _from, uint256 _amount) external;
}
