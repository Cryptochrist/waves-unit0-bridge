// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/**
 * @title IWrappedNFT
 * @notice Interface for wrapped NFTs that can be minted/burned by the bridge
 */
interface IWrappedNFT is IERC721 {
    /**
     * @notice Initialize the wrapped NFT collection
     * @param name Collection name
     * @param symbol Collection symbol
     * @param baseURI Base URI for token metadata
     * @param bridge Address of the bridge contract (has mint/burn rights)
     */
    function initialize(
        string memory name,
        string memory symbol,
        string memory baseURI,
        address bridge
    ) external;

    /**
     * @notice Mint an NFT to an address (only callable by bridge)
     * @param to Recipient address
     * @param tokenId Token ID to mint
     */
    function mint(address to, uint256 tokenId) external;

    /**
     * @notice Mint an NFT with specific WAVES asset ID mapping
     * @param to Recipient address
     * @param tokenId Token ID to mint
     * @param wavesNftId Original WAVES NFT ID
     */
    function mintWithWavesId(address to, uint256 tokenId, string memory wavesNftId) external;

    /**
     * @notice Burn an NFT (only callable by bridge)
     * @param tokenId Token ID to burn
     */
    function burn(uint256 tokenId) external;

    /**
     * @notice Get the WAVES NFT ID for a given token ID
     */
    function getWavesNftId(uint256 tokenId) external view returns (string memory);

    /**
     * @notice Get the bridge address
     */
    function bridge() external view returns (address);
}
