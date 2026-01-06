



## Notas importantes
Entre usar require o revert como en el siguiente ejemplo, segun lo investigado:
Ambas opciones revierten la transacción y devuelven el gas no usado.
Con require 
  el mensaje es visible en herramientas como Remix, Hardhat, Foundry.
  Sintaxis corta y familiar
  Mensaje de error simple (string) útil para validaciones rápidas.
  No hay tipado fuerte: el mensaje no se puede usar en análisis estático

Con revert + errores personalizados.
  El mensaje aparece como el nombre del error (más limpio y profesional).
  Más eficiente en gas (no almacena string en bytecode)
  Tipado fuerte: el error es parte del ABI, útil para herramientas y dApps
  Permite parámetros en el error (ej. revert TokenAlreadyExists(token)).
  Mejor para contratos grandes y librerías modernas (OpenZeppelin v5 recomienda esto)
  Sintaxis un poco más larga, necesita declarar los errores.

  Ejemplo
```
  error TokenAlreadyExists(address token);
  error ZeroAddress();

  function addToken(address token) external onlyOwner {
        if (token == address(0)) revert ZeroAddress();
        // require (token != address(0), "Invalid token address") 
        if (allowedToken[token]) revert TokenAlreadyExists(token);
        // require (!allowedToken[token], "Token already added");
        allowedToken[token] = true;
        tokenList.push(token);
        emit TokenAdded(token);
    }
```