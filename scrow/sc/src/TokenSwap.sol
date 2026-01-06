
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TokenSwap is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    constructor() Ownable(msg.sender) {}

    enum OperationStatus {
        Open,
        Completed,
        Cancelled
    }

    struct Operation {
        uint256 id;
        address maker; // creador de la operación
        address taker; // quien completa la operación
        address tokenA; // token que ofrece el maker
        address tokenB; // token que ofrece el taker
        uint256 amountA;
        uint256 amountB;
        OperationStatus status;
        uint256 createdAt;
        uint256 completedAt;
        uint256 cancelledAt;
        uint256 expiresAt;
    }

    uint256 public nextOperationId;
    Operation[] private operations;

    mapping(address => bool) public allowedToken; // tokens permitidos
    address[] private tokenList; // lista de tokens permitidos

    uint256[] private openIds; // IDs de operaciones abiertas
    uint256[] private completedIds;
    uint256[] private cancelledIds;

    uint256 public constant MIN_EXPIRATION = 1 hours; // duración mínima de expiración
    uint256 public defaultExpiration = 1 days; // duración por defecto

    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);
    event DefaultExpirationUpdated(uint256 newDuration);
    event OperationCreated(
        uint256 indexed id,
        address indexed maker,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 expiresAt
    );
    event OperationCompleted(
        uint256 indexed id,
        address indexed maker,
        address indexed taker,
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    );
    event OperationCancelled(uint256 indexed id, address indexed maker);

    error TokenNotAllowed(address token);
    error TokenAlreadyExists(address token);
    error InvalidAmount();
    error OperationNotOpen(uint256 id);
    error NotMaker(uint256 id, address caller);
    error SameToken();
    error ZeroAddress();
    error DurationTooShort(uint256 duration);
    error OperationExpired(uint256 id, uint256 expiresAt, uint256 nowTs);

    // ---- administración ----
    function addToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        if (allowedToken[token]) revert TokenAlreadyExists(token);
        allowedToken[token] = true;
        tokenList.push(token);
        emit TokenAdded(token);
    }

    function removeToken(address token) external onlyOwner {
        if (!allowedToken[token]) return;
        allowedToken[token] = false;
        emit TokenRemoved(token);
    }

    function getAllowedTokens() external view returns (address[] memory) {
        return tokenList;
    }

    function setDefaultExpiration(uint256 newDuration) external onlyOwner {
        if (newDuration < MIN_EXPIRATION) revert DurationTooShort(newDuration);
        defaultExpiration = newDuration;
        emit DefaultExpirationUpdated(newDuration);
    }

    // ---- operaciones ----
    function createOperation(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB
    ) external nonReentrant {
        _createOperation(tokenA, tokenB, amountA, amountB, defaultExpiration);
    }

    function createOperation(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 durationSecs
    ) external nonReentrant {
        if (durationSecs < MIN_EXPIRATION) revert DurationTooShort(durationSecs);
        _createOperation(tokenA, tokenB, amountA, amountB, durationSecs);
    }

    function _createOperation(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        uint256 durationSecs
    ) internal {
        if (tokenA == address(0) || tokenB == address(0)) revert ZeroAddress();
        if (!allowedToken[tokenA]) revert TokenNotAllowed(tokenA);
        if (!allowedToken[tokenB]) revert TokenNotAllowed(tokenB);
        if (tokenA == tokenB) revert SameToken();
        if (amountA == 0 || amountB == 0) revert InvalidAmount();

        IERC20(tokenA).safeTransferFrom(msg.sender, address(this), amountA);

        uint256 id = nextOperationId++;
        uint256 expiresAt = block.timestamp + durationSecs;

        Operation memory op = Operation({
            id: id,
            maker: msg.sender,
            taker: address(0),
            tokenA: tokenA,
            tokenB: tokenB,
            amountA: amountA,
            amountB: amountB,
            status: OperationStatus.Open,
            createdAt: block.timestamp,
            completedAt: 0,
            cancelledAt: 0,
            expiresAt: expiresAt
        });

        operations.push(op);
        openIds.push(id);

        emit OperationCreated(id, msg.sender, tokenA, tokenB, amountA, amountB, expiresAt);
    }

    function completeOperation(uint256 operationId) external nonReentrant {
        Operation storage op = _getOperationById(operationId);
        if (op.status != OperationStatus.Open) revert OperationNotOpen(operationId);
        if (block.timestamp > op.expiresAt) {
            revert OperationExpired(operationId, op.expiresAt, block.timestamp);
        }
        // msg.sender es quien cierra la operación (taker) y envia tokenB al maker (quien inició la operación)
        IERC20(op.tokenB).safeTransferFrom(msg.sender, op.maker, op.amountB);
        // Se le envía al taker (msg.sender) el tokenA que había depositado el maker
        IERC20(op.tokenA).safeTransfer(msg.sender, op.amountA);

        op.taker = msg.sender;
        op.status = OperationStatus.Completed;
        op.completedAt = block.timestamp;

        _moveIdBetweenStateArrays(operationId, openIds, completedIds);

        emit OperationCompleted(
            operationId,
            op.maker,
            msg.sender,
            op.tokenA,
            op.tokenB,
            op.amountA,
            op.amountB
        );
    }

    function cancelOperation(uint256 operationId) external nonReentrant {
        Operation storage op = _getOperationById(operationId);
        if (op.status != OperationStatus.Open) revert OperationNotOpen(operationId);
        if (op.maker != msg.sender) revert NotMaker(operationId, msg.sender); // solo el creador (maker) puede cancelar

        IERC20(op.tokenA).safeTransfer(op.maker, op.amountA);

        op.status = OperationStatus.Cancelled;
        op.cancelledAt = block.timestamp;

        _moveIdBetweenStateArrays(operationId, openIds, cancelledIds);

        emit OperationCancelled(operationId, op.maker);
    }

    // ---- vistas ----
    function getOperation(uint256 operationId) external view returns (Operation memory) {
        return _getOperationById(operationId);
    }

    function getAllOperations() public view returns (Operation[] memory) {
        return operations;
    }

    function getAllowedOperations() external view returns (Operation[] memory) {
        return getAllOperations();
    }

    function getOpenOperationIds() external view returns (uint256[] memory) {
        return openIds;
    }

    function getCompletedOperationIds() external view returns (uint256[] memory) {
        return completedIds;
    }

    function getCancelledOperationIds() external view returns (uint256[] memory) {
        return cancelledIds;
    }

   function getOperationsSlice(uint256 offset, uint256 limit)
    external
    view
    returns (Operation[] memory)
   {
       uint256 total = operations.length;
       if (offset >= total) {
           return new Operation[](0);
       }
   
       uint256 endExclusive = offset + limit;
       if (endExclusive > total) {
           endExclusive = total;
       }
       uint256 size = endExclusive - offset;
   
       Operation[] memory out = new Operation[](size);
       for (uint256 i = 0; i < size; i++) {
           out[i] = operations[offset + i];
       }
       return out;
   }
    

 function getUserBalances(address user)
    external
    view
    returns (address[] memory tokens, uint256[] memory balances)
     {
    uint256 n = tokenList.length;
    tokens = new address[](n);
    balances = new uint256[](n);

    for (uint256 i = 0; i < n; i++) {
        address t = tokenList[i];
        tokens[i] = t;
        if (allowedToken[t]) {
            balances[i] = IERC20(t).balanceOf(user);
        } else {
            balances[i] = 0;
        }
    }
     }


    function isExpired(uint256 operationId) external view returns (bool) {
        Operation storage op = _getOperationById(operationId);
        return (op.status == OperationStatus.Open && block.timestamp > op.expiresAt);
    }

    // ---- utils internas ----
    function _getOperationById(uint256 operationId) internal view returns (Operation storage) {
        require(operationId < operations.length, "Invalid operationId");
        return operations[operationId];
    }

  // Mueve un ID de operación entre dos arrays de estados explicitamente de openIds a completedIds o cancelledIds
  // Esto es más gas eficiente que reconstruir los arrays completos para el UI siempre que se espere un volumen razónable de operaciones en caso
  // de muchas operaciones abiertas, este enfoque puede volverse costoso en gas y sea mejor usar el estatus dentro de la struct Operation
  
    function _moveIdBetweenStateArrays(
        uint256 id,
        uint256[] storage fromArr,
        uint256[] storage toArr
    ) internal {
        uint256 len = fromArr.length;
        for (uint256 i = 0; i < len; i++) {
            if (fromArr[i] == id) {
                if (i != len - 1) {
                    fromArr[i] = fromArr[len - 1];
                }
                fromArr.pop();
                break;
            }
        }
        toArr.push(id);
    }
}

