
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TokenSwap} from "../src/TokenSwap.sol";
import {MockERC20} from "../src/MockERC20.sol";

contract TokenSwapTest is Test {
    TokenSwap public swap;
    MockERC20 public tokenA;
    MockERC20 public tokenB;

    address public owner;
    address public maker;
    address public taker;

    uint256 constant DECIMALS = 1e18;
    uint256 constant MAKER_INIT_A = 1_000 * DECIMALS;
    uint256 constant MAKER_INIT_B = 500 * DECIMALS;
    uint256 constant TAKER_INIT_A = 500 * DECIMALS;
    uint256 constant TAKER_INIT_B = 1_000 * DECIMALS;

    function setUp() public {
        // Cuentas de prueba
        owner = address(this);
        maker = makeAddr("maker");
        taker = makeAddr("taker");

        // Despliegue de tokens mock
        tokenA = new MockERC20("TokenA", "TKA");
        tokenB = new MockERC20("TokenB", "TKB");

        // Despliegue del swap (Ownable v5: owner = msg.sender = test contract)
        swap = new TokenSwap();

        // Registrar tokens permitidos en el swap
        swap.addToken(address(tokenA));
        swap.addToken(address(tokenB));

        // Mint de saldos para pruebas
        tokenA.mint(maker, MAKER_INIT_A);
        tokenB.mint(maker, MAKER_INIT_B);

        tokenA.mint(taker, TAKER_INIT_A);
        tokenB.mint(taker, TAKER_INIT_B);

        // Sanity check de balances iniciales
        assertEq(tokenA.balanceOf(maker), MAKER_INIT_A, "maker A init");
        assertEq(tokenB.balanceOf(maker), MAKER_INIT_B, "maker B init");
        assertEq(tokenA.balanceOf(taker), TAKER_INIT_A, "taker A init");
        assertEq(tokenB.balanceOf(taker), TAKER_INIT_B, "taker B init");
    }

    // ========== Tests básicos de administración (sin removeToken) ==========
    function test_AddToken_and_GetAllowedTokens() public {
        address[] memory allowed = swap.getAllowedTokens();
        assertEq(allowed.length, 2, "Debe haber 2 tokens permitidos");
        assertEq(allowed[0], address(tokenA), "TokenA en posicion 0");
        assertEq(allowed[1], address(tokenB), "TokenB en posicion 1");
    }

    // ========== Crear operación con expiración por defecto ==========
    function test_CreateOperation_Default() public {
        uint256 amountA = 100 * DECIMALS;
        uint256 amountB = 200 * DECIMALS;

        // maker aprueba amountA de tokenA al contrato swap
        vm.prank(maker);
        tokenA.approve(address(swap), amountA);

        // crear operación con expiración por defecto
        vm.prank(maker);
        swap.createOperation(address(tokenA), address(tokenB), amountA, amountB);

        // La operación con id=0 debe existir
        TokenSwap.Operation memory op = swap.getOperation(0);
        assertEq(op.id, 0);
        assertEq(op.maker, maker);
        assertEq(op.taker, address(0));
        assertEq(op.tokenA, address(tokenA));
        assertEq(op.tokenB, address(tokenB));
        assertEq(op.amountA, amountA);
        assertEq(op.amountB, amountB);
        assertEq(uint8(op.status), uint8(TokenSwap.OperationStatus.Open));

        // El contrato debe tener el escrow de amountA
        assertEq(tokenA.balanceOf(address(swap)), amountA, "escrow A");
        // El maker debe haber sido debitado
        assertEq(tokenA.balanceOf(maker), MAKER_INIT_A - amountA, "maker A debited");

        // IDs abiertas debe contener 0
        uint256[] memory openIds = swap.getOpenOperationIds();
        assertEq(openIds.length, 1);
        assertEq(openIds[0], 0);
    }

    // ========== Completar operación correctamente ==========
    function test_CompleteOperation_Flow() public {
        uint256 amountA = 100 * DECIMALS;
        uint256 amountB = 200 * DECIMALS;

        // Crear operación por el maker
        vm.startPrank(maker);
        tokenA.approve(address(swap), amountA);
        swap.createOperation(address(tokenA), address(tokenB), amountA, amountB);
        vm.stopPrank();

        // Taker aprueba tokenB por amountB y completa
        vm.startPrank(taker);
        tokenB.approve(address(swap), amountB);
        swap.completeOperation(0);
        vm.stopPrank();

        // Verificar estado y balances
        TokenSwap.Operation memory op = swap.getOperation(0);
        assertEq(uint8(op.status), uint8(TokenSwap.OperationStatus.Completed), "status completed");
        assertEq(op.taker, taker, "taker correcto");

        // El taker debe recibir amountA de tokenA
        assertEq(tokenA.balanceOf(taker), TAKER_INIT_A + amountA, "taker A recibido");

        // El maker debe recibir amountB de tokenB
        assertEq(tokenB.balanceOf(maker), MAKER_INIT_B + amountB, "maker B recibido");

        // El contrato ya no debe tener tokenA en escrow
        assertEq(tokenA.balanceOf(address(swap)), 0, "escrow A limpio");

        // IDs: open vacío, completed con 0
        uint256[] memory openIds = swap.getOpenOperationIds();
        assertEq(openIds.length, 0, "no open");
        uint256[] memory completedIds = swap.getCompletedOperationIds();
        assertEq(completedIds.length, 1);
        assertEq(completedIds[0], 0);
    }

    // ========== Cancelar operación por el maker ==========
    function test_CancelOperation_ByMaker() public {
        uint256 amountA = 50 * DECIMALS;
        uint256 amountB = 75 * DECIMALS;

        // Crear operación id=0
        vm.startPrank(maker);
        tokenA.approve(address(swap), amountA);
        swap.createOperation(address(tokenA), address(tokenB), amountA, amountB);
        vm.stopPrank();

        // Cancelar por el maker
        vm.prank(maker);
        swap.cancelOperation(0);

        // Verificar estado y balances
        TokenSwap.Operation memory op = swap.getOperation(0);
        assertEq(uint8(op.status), uint8(TokenSwap.OperationStatus.Cancelled), "status cancelled");
        assertEq(tokenA.balanceOf(maker), MAKER_INIT_A, "maker recibe A de vuelta");
        assertEq(tokenA.balanceOf(address(swap)), 0, "escrow A limpio");

        // IDs: open vacío, cancelled incluye 0
        uint256[] memory openIds = swap.getOpenOperationIds();
        assertEq(openIds.length, 0);
        uint256[] memory cancelledIds = swap.getCancelledOperationIds();
        assertEq(cancelledIds.length, 1);
        assertEq(cancelledIds[0], 0);
    }

    // ========== Expiración: impedir completar si ha expirado ==========
    
    function test_CannotComplete_WhenExpired() public {
        uint256 amountA = 10 * DECIMALS;
        uint256 amountB = 20 * DECIMALS;
        uint256 duration = 1 hours; // mínimo permitido
    
        // Crear operación id=0 con duración 1 hora
        vm.startPrank(maker);
        tokenA.approve(address(swap), amountA);
        swap.createOperation(address(tokenA), address(tokenB), amountA, amountB, duration);
        vm.stopPrank();
    
        TokenSwap.Operation memory op = swap.getOperation(0);
    
        // Avanza el tiempo más allá de la expiración
        vm.warp(op.expiresAt + 1);
    
        // Taker intenta completar, esperamos el custom error con sus argumentos exactos
        vm.startPrank(taker);
        tokenB.approve(address(swap), amountB);
    
        uint256 nowTs = block.timestamp; // = op.expiresAt + 1
        vm.expectRevert(
            abi.encodeWithSelector(
                TokenSwap.OperationExpired.selector,
                0,
                op.expiresAt,
                nowTs
            )
        );
        swap.completeOperation(0);
        vm.stopPrank();
    
        // Verificación de estado
        TokenSwap.Operation memory op2 = swap.getOperation(0);
        assertEq(uint8(op2.status), uint8(TokenSwap.OperationStatus.Open), "sigue open");
        assertTrue(swap.isExpired(0), "helper isExpired true");
    }



    // ========== Paginación: getOperationsSlice ==========
    function test_GetOperationsSlice_Pagination() public {
        // Crear 3 operaciones para paginar
        for (uint256 i = 0; i < 3; i++) {
            uint256 amountA = (i + 1) * 10 * DECIMALS;
            uint256 amountB = (i + 1) * 20 * DECIMALS;
            vm.startPrank(maker);
            tokenA.approve(address(swap), amountA);
            swap.createOperation(address(tokenA), address(tokenB), amountA, amountB);
            vm.stopPrank();
        }
        // Ahora hay 3 operaciones: ids 0,1,2
        TokenSwap.Operation[] memory slice = swap.getOperationsSlice(1, 2);
        assertEq(slice.length, 2, "slice tamano 2");
        assertEq(slice[0].id, 1, "primer elemento id=1");
        assertEq(slice[1].id, 2, "segundo elemento id=2");

        // Offset fuera de rango -> vacío
        TokenSwap.Operation[] memory empty = swap.getOperationsSlice(5, 10);
        assertEq(empty.length, 0, "slice vacio para offset>=total");
    }

    // ========== Balances por usuario: getUserBalances ==========
    function test_GetUserBalances() public {
        (address[] memory tokens, uint256[] memory balances) = swap.getUserBalances(maker);
        assertEq(tokens.length, 2, "2 tokens listados");
        assertEq(balances.length, 2, "2 balances");
        assertEq(tokens[0], address(tokenA), "tokens[0] = tokenA");
        assertEq(tokens[1], address(tokenB), "tokens[1] = tokenB");

        // En este punto (si no has corrido otras pruebas alterando balances),
        // maker debería tener los montos de setUp (no se hicieron movimientos).
        assertEq(balances[0], tokenA.balanceOf(maker), "balance coincide A");
        assertEq(balances[1], tokenB.balanceOf(maker), "balance coincide B");
    }
}
