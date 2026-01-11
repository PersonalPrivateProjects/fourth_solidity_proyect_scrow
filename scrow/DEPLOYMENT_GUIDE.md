
# 🚀 **Scrow – DAO Voting Platform (Local TokenSwap Demo)**

Guía paso a paso para desplegar **Scrow** en local con **Anvil/Foundry** y arrancar la **DApp web**. Incluye cómo **usar** la app y secciones de solución de problemas.

> ℹ️ **Contexto**: Este proyecto incluye un módulo de demostración de **intercambio de tokens (TokenSwap)** con tres tokens mock **A/B/C** (ERC‑20) para pruebas locales.

---

## 📚 Índice
- [Requisitos](#-requisitos)
- [1) Iniciar la red local](#1-iniciar-la-red-local)
- [2) Variables de entorno (contratos)](#2-variables-de-entorno-contratos)
- [3) Compilar, testear y desplegar contratos](#3-compilar-testear-y-desplegar-contratos)
- [4) Configurar la DApp web](#4-configurar-la-dapp-web)
  - [4.1) Variables de entorno](#41-variables-de-entorno)
  - [4.2) Iniciar la aplicación](#42-iniciar-la-aplicación)
  - [4.3) Configurar MetaMask](#43-configurar-metamask)
- [Cómo usar la DApp](#-cómo-usar-la-dapp)
- [Comandos rápidos](#-comandos-rápidos)
- [Solución de problemas](#-solución-de-problemas)

---

## ✅ Requisitos
- **Foundry** (incluye `anvil` y `forge`)
- **Node.js** + **npm**/**pnpm**
- **MetaMask** en el navegador

> Sugerencia: Ten dos terminales: una para **anvil** y otra para **build/deploy**.

---

## ✅ 1) Iniciar la red local

En una terminal, entra a la carpeta de contratos `sc` y levanta **Anvil**:

```bash
cd sc
anvil
```

Esto inicia una blockchain local en `http://127.0.0.1:8545` con **10 cuentas**, cada una con **10,000 ETH**.

> 💡 **Tip:** Copia la **private key** de la primera cuenta que muestra Anvil; se usará para el deployment.

---

## ✅ 2) Variables de entorno (contratos)

En la carpeta `sc`:

```bash
cp .env.example .env
```

Edita `.env` para que quede así:

```env
RPC_URL=http://localhost:8545
MNEMONIC="test test test test test test test test test test test junk"
CHAIN_ID=31337

# Cuentas por defecto de Anvil (derivadas del mnemonic de Foundry)
ANVIL_A0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
ANVIL_A1=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
ANVIL_A2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
ANVIL_A3=0x90F79bf6EB2c4f870365E785982E1f101E93b906
```

---

## ✅ 3) Compilar, testear y desplegar contratos

Abre **otra terminal** (sin cerrar la de `anvil`) y ejecuta:

```bash
cd sc

# Compilar contratos
forge build

# Ejecutar tests
forge test
```

### 🚀 Deploy
Ejecuta el script de despliegue (y exportación de ABIs):

```bash
./scripts/deploy_and_export_abis.sh
```

Este script:
- Despliega **TokenSwap.sol** y **MockERC20.sol** usando la **primera cuenta de Anvil** como `owner`.
- Minta **1,000,000** tokens **A**, **B**, **C** al `owner`.
- Envía **1,000** tokens de cada tipo a las cuentas listadas en `.env`.

Al finalizar verás algo como:

```
== Logs ==
  TokenSwap: 0x5FbDB2315678afecb367f032d93F642f64180aa3
  Token A:    0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
  Token B:    0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
  Token C:    0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
  Minted 1000 TKA/TKB/TKC to A0..A3
```

> ⚠️ **Importante**: Anota la **dirección de `TokenSwap`**; la usarás en la DApp web.

> 📦 **ABIs**: El script exporta los ABIs para el front (ruta definida en el propio script).

---

## ✅ 4) Configurar la DApp web

### 4.1) Variables de entorno
En la carpeta del front (por ejemplo `webapp`):

```bash
cp .env.example .env.local
```

Edita `.env.local` y reemplaza `NEXT_PUBLIC_SWAP_ADDRESS` por la dirección real de `TokenSwap` obtenida en el despliegue:

```env
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_SWAP_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### 4.2) Iniciar la aplicación

```bash
cd ../webapp
npm install
npm run dev
```

La app quedará disponible en **http://localhost:3000**

### 4.3) Configurar MetaMask
1) MetaMask → **Settings → Networks → Add Network**
   - **Network Name**: Localhost
   - **RPC URL**: `http://127.0.0.1:8545`
   - **Chain ID**: `31337`
   - **Currency Symbol**: `ETH`
2) Importa cuentas de Anvil (**Import Account** con *private key*):
   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
   0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
   0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
   ```

---

## 🧭 Cómo usar la DApp

1. **Conecta tu wallet**
   - Clic en **Connect Wallet** y elige una cuenta importada de Anvil.
2. **Revisa tus balances**
   - La pantalla principal muestra saldos de **Token A/B/C**.
3. **Aprobar (si aplica)**
   - Si el flujo lo requiere, primero aprueba el gasto del token a **TokenSwap** (botón **Approve** → confirma en MetaMask).
4. **Hacer un *swap***
   - Elige token origen/destino, ingresa cantidad y confirma el **Swap** en MetaMask.
5. **Historial / Estado**
   - Verás confirmaciones y, si existe, una sección de historial con tus transacciones.

> 💡 Si el swap no aparece, verifica que estés en la **red 31337**, la **dirección de contrato** en `.env.local` es correcta y que **Anvil** sigue corriendo.

---

## 🧰 Comandos rápidos

```bash
# 1) Levantar anvil
yarn anvil   # si tienes alias; si no, ejecuta: anvil

# 2) Build & tests (en sc/)
forge build && forge test

# 3) Deploy + export ABIs (en sc/)
./scripts/deploy_and_export_abis.sh

# 4) Front (en webapp/)
npm install && npm run dev
```

---

## 🧯 Solución de problemas

- **CHAIN_ID incorrecto / Red no detectada**
  - Asegúrate de que MetaMask esté en la red `31337` y que `NEXT_PUBLIC_CHAIN_ID=31337`.
- **Dirección de contrato errónea**
  - Revisa la salida del deploy y actualiza `NEXT_PUBLIC_SWAP_ADDRESS` en `.env.local`. Reinicia `npm run dev`.
- **Anvil en puerto distinto**
  - Si usas otro puerto, ajusta `RPC_URL`/`NEXT_PUBLIC_RPC_URL`.
- **Transacción atascada o nonce raro**
  - En MetaMask: *Settings → Advanced → Reset account* (solo en local). 
- **ABIs desactualizados**
  - Re-ejecuta el script de deploy/export y reinicia el front.

---
