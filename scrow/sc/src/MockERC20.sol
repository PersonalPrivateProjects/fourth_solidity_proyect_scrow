// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        // Mint inicial al deployer
        _mint(msg.sender, 1_000_000 * 10 ** decimals());
    }

    /// @notice Mint adicional para pruebas
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
