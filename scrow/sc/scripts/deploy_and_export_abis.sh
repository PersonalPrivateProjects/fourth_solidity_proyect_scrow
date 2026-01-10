
#!/usr/bin/env bash
set -euo pipefail

# ==== Rutas FIJAS para tu estructura ====
PROJECT_ROOT="$(pwd)"                 # Debe ser scrow/
SC_DIR="${PROJECT_ROOT}"           # Proyecto solidity
WEB_LIB_DIR="${PROJECT_ROOT}/web/src/lib"
ENV_FILE="${SC_DIR}/.env"             # .env dentro de sc/

echo "📁 PROJECT_ROOT = ${PROJECT_ROOT}"
echo "📁 SC_DIR       = ${SC_DIR}"
echo "📁 WEB_LIB_DIR  = ${WEB_LIB_DIR}"
echo "🧩 ENV_FILE     = ${ENV_FILE}"

# ==== Cargar .env de sc/ ====
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  source "${ENV_FILE}"
  set +a
else
  echo "ERROR: No se encontró ${ENV_FILE}" >&2
  exit 1
fi

: "${RPC_URL:?RPC_URL no definido en sc/.env}"
: "${MNEMONIC:?MNEMONIC no definido en sc/.env}"
: "${CHAIN_ID:?CHAIN_ID no definido en sc/.env}"

# Quitar comillas del MNEMONIC si vienen en .env
MNEMONIC_STRIPPED="${MNEMONIC%\"}"
MNEMONIC_STRIPPED="${MNEMONIC_STRIPPED#\"}"

# ==== Dependencias ====
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq no está instalado. Instálalo (e.g., sudo apt-get install jq)" >&2
  exit 1
fi

mkdir -p "${WEB_LIB_DIR}"

# ==== 1) Deploy EXACTO dentro de sc/ ====
echo "[1/4] Deploy con forge script (en sc/)..."
pushd "${SC_DIR}" >/dev/null

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "${RPC_URL}" \
  --broadcast \
  --mnemonics "${MNEMONIC_STRIPPED}" \
  --mnemonic-indexes 0 \
  --chain-id "${CHAIN_ID}" \
  -vvvv

# ==== 2) Build para asegurar artefactos en sc/out ====
echo "[2/4] forge build (en sc/)..."
forge build


# ==== 3) Exportar ABIs desde sc/out a web/src/lib ====
echo "[3/4] Exportando ABIs con jq desde sc/out a web/src/lib..."

# Estamos dentro de sc/ por el pushd anterior
# TokenSwap ABI
jq -r '.abi' out/TokenSwap.sol/TokenSwap.json > ../web/src/lib/TokenSwap.abi.json

# MockERC20 ABI
jq -r '.abi' out/MockERC20.sol/MockERC20.json > ../web/src/lib/MockERC20.abi.json

# Sanity checks
test -s ../web/src/lib/TokenSwap.abi.json || { echo "ERROR: TokenSwap ABI vacío"; exit 1; }
test -s ../web/src/lib/MockERC20.abi.json || { echo "ERROR: MockERC20 ABI vacío"; exit 1; }

echo "   ✅ Exportados: ../web/src/lib/TokenSwap.abi.json y ../web/src/lib/MockERC20.abi.json"

# ==== 3.1) Exportar Bitcode de MockERC20  sc/out a web/src/lib ====
echo "[3.1/4] Exportando Bitcode de MockERC20 desde sc/out a web/src/lib..."
jq -r '{bytecode: .bytecode.object}' out/MockERC20.sol/MockERC20.json > ../web/src/lib/MockERC20.bytecode.json

# ==== 4) (Opcional) Escribir direcciones a web/.env.local desde el log ====
echo "[4/4] Capturando direcciones del deploy desde broadcast logs..."
BROADCAST_DIR="${SC_DIR}/broadcast/Deploy.s.sol/${CHAIN_ID}"
RUN_LOG="${BROADCAST_DIR}/run-latest.log"

if [[ -f "${RUN_LOG}" ]]; then
  SWAP_ADDR=$(grep -Eo 'TokenSwap:\s+0x[0-9a-fA-F]+' -m1 "${RUN_LOG}" | awk '{print $2}')
  TOKEN_A=$(grep -Eo 'Token A:\s+0x[0-9a-fA-F]+' -m1 "${RUN_LOG}" | awk '{print $3}')
  TOKEN_B=$(grep -Eo 'Token B:\s+0x[0-9a-fA-F]+' -m1 "${RUN_LOG}" | awk '{print $3}')
  TOKEN_C=$(grep -Eo 'Token C:\s+0x[0-9a-fA-F]+' -m1 "${RUN_LOG}" | awk '{print $3}')

  WEB_ENV="${PROJECT_ROOT}/web/.env.local"
  {
    [[ -n "${SWAP_ADDR}" ]] && echo "NEXT_PUBLIC_SWAP_ADDRESS=${SWAP_ADDR}"
    [[ -n "${TOKEN_A}"   ]] && echo "NEXT_PUBLIC_TOKEN_A=${TOKEN_A}"
    [[ -n "${TOKEN_B}"   ]] && echo "NEXT_PUBLIC_TOKEN_B=${TOKEN_B}"
    [[ -n "${TOKEN_C}"   ]] && echo "NEXT_PUBLIC_TOKEN_C=${TOKEN_C}"
    echo "NEXT_PUBLIC_RPC_URL=${RPC_URL}"
    echo "NEXT_PUBLIC_CHAIN_ID=${CHAIN_ID}"
  } > "${WEB_ENV}"

  echo "📝 Escrito ${WEB_ENV} con direcciones y RPC/CHAIN_ID."
else
  echo "⚠️ No se encontró ${RUN_LOG}. Si quieres, lo cambiamos a leer run-latest.json con jq."
fi

echo "✅ Listo: ABIs en ${WEB_LIB_DIR}"

