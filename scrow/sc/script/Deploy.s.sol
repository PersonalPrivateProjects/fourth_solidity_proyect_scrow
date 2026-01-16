
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console2.sol";

import {TokenSwap} from "../src/TokenSwap.sol";
import {MockERC20} from "../src/MockERC20.sol";

contract Deploy is Script {   

    function run() external {
        // Si quieres usar PRIVATE_KEY desde .env: descomenta estas 2 líneas y el startBroadcast(pk)
        // uint256 pk = vm.envUint("PRIVATE_KEY");
        // vm.startBroadcast(pk);

         // === Leer cuentas desde .env ===
        address A0 = vm.envAddress("ANVIL_A0");
        address A1 = vm.envAddress("ANVIL_A1");
        address A2 = vm.envAddress("ANVIL_A2");
        address A3 = vm.envAddress("ANVIL_A3");

        // Usar signer provisto por CLI (--mnemonic / --mnemonic-index)
        vm.startBroadcast();

        // 1) Desplegar el contrato principal (owner = msg.sender)
        TokenSwap swap = new TokenSwap();
        console2.log("TokenSwap:", address(swap));

        // 2) Desplegar 3 tokens
        MockERC20 tokenA = new MockERC20("Token A", "TKA");
        MockERC20 tokenB = new MockERC20("Token B", "TKB");
        MockERC20 tokenC = new MockERC20("Token C", "TKC");

        console2.log("Token A:", address(tokenA));
        console2.log("Token B:", address(tokenB));
        console2.log("Token C:", address(tokenC));

        // 3) Agregar tokens permitidos en el escrow (TokenSwap)
        swap.addToken(address(tokenA));
        swap.addToken(address(tokenB));
        swap.addToken(address(tokenC));

        // 4) Mintear 1000 tokens (con decimales) a las primeras 4 cuentas de Anvil
        address[4] memory accounts = [A0, A1, A2, A3];

        uint256 amountA = 1000 * (10 ** uint256(tokenA.decimals()));
        uint256 amountB = 1000 * (10 ** uint256(tokenB.decimals()));
        uint256 amountC = 1000 * (10 ** uint256(tokenC.decimals()));

        for (uint256 i = 0; i < accounts.length; i++) {
            tokenA.mint(accounts[i], amountA);
            tokenB.mint(accounts[i], amountB);
            tokenC.mint(accounts[i], amountC);
        }

        console2.log("Minted 1000 TKA/TKB/TKC to A0..A3");

        vm.stopBroadcast();

        // Nota: El constructor de MockERC20 ya mintéa 1,000,000 al deployer (msg.sender).
        // Este script además entrega 1000 tokens a cada una de las cuentas A0..A3 para pruebas.
    }
}

