
// src/lib/useScrowHelper.ts
"use client";

import { BigNumberish, formatUnits, parseUnits } from "ethers";
import { useCallback, useMemo, useState } from "react";
import { useWeb3 } from "./ethereum";
import { getErc20, getTokenSwap, TOKENS, TOKEN_SWAP_ADDRESS } from "./contracts";

export type OperationStatus = "Open" | "Completed" | "Cancelled";

export interface Operation {
  id: bigint;
  maker: string;
  taker: string;
  tokenA: string;
  tokenB: string;
  amountA: bigint;
  amountB: bigint;
  status: OperationStatus;
  createdAt: bigint;
  completedAt: bigint;
  cancelledAt: bigint;
  expiresAt: bigint;
}

const statusFromNumber = (n: bigint): OperationStatus =>
  n === 0n ? "Open" : n === 1n ? "Completed" : "Cancelled";

export const useScrowHelper = () => {
  const { provider, signer, account } = useWeb3();
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  const log = useCallback((s: string) => {
    setLogs((prev) => [s, ...prev].slice(0, 200));
    // también console.log
    // eslint-disable-next-line no-console
    console.log(s);
  }, []);

  // Instancias del contrato TokenSwap
  const swapRead = useMemo(() => (provider ? getTokenSwap(provider) : null), [provider]); // sin signer solo lectura
  const swapWrite = useMemo(() => (signer ? getTokenSwap(signer) : null), [signer]); // con signer para escritura

  const fetchOwner = useCallback(async (): Promise<string | null> => {
    if (!swapRead) return null;
    try {
      const owner: string = await (swapRead as any).owner();
      return owner.toLowerCase();
    } catch {
      return null;
    }
  }, [swapRead]);

  const getDecimals = useCallback(
    async (token: string) => {
      if (!provider) throw new Error("Provider no disponible");
      const erc = getErc20(token, provider);
      return Number(await erc.decimals());
    },
    [provider]
  );

  const ensureAllowance = useCallback(
    async (token: string, owner: string, spender: string, required: bigint) => {
      if (!signer || !provider) throw new Error("Conecta la wallet primero");
      const ercR = getErc20(token, provider);
      const ercW = getErc20(token, signer);
      const allowance: bigint = await ercR.allowance(owner, spender);
      if (allowance < required) {
        const tx = await ercW.approve(spender, required);
        log(`Aprobando ${token} por ${required.toString()}… tx=${tx.hash}`);
        await tx.wait();
        log(`Aprobación confirmada`);
      }
    },
    [signer, provider, log]
  );

  const addToken = useCallback(
    async (tokenAddress: string) => {
      if (!swapWrite || !account) throw new Error("Conecta la wallet");
      const tx = await (swapWrite as any).addToken(tokenAddress);
      log(`addToken(${tokenAddress}) → ${tx.hash}`);
      await tx.wait();
      log(`Token agregado: ${tokenAddress}`);
    },
    [swapWrite, account, log]
  );

  const getActiveAllowedTokens = useCallback(async (): Promise<string[]> => {
    if (!swapRead) return [];
    // El contrato expone getAllowedTokens() = tokenList; y mapping allowedToken(addr)
    const tokenList: string[] = await (swapRead as any).getAllowedTokens();
    const active: string[] = [];
    for (const t of tokenList) {
      const ok: boolean = await (swapRead as any).allowedToken(t);
      if (ok) active.push(t);
    }
    return active;
  }, [swapRead]);

  
 
const createOperation = useCallback(
  async (
    tokenA: string,
    tokenB: string,
    amountAUi: string,
    amountBUi: string,
    durationSecs?: number
  ) => {
    if (!swapWrite || !provider || !signer || !account) {
      throw new Error("Conecta la wallet");
    }
    if (!tokenA || !tokenB) {
      throw new Error("Selecciona tokens");
    }
    if (tokenA.toLowerCase() === tokenB.toLowerCase()) {
      throw new Error("Tokens deben ser distintos");
    }

    // Parsear montos con los decimales correctos
    const decA = await getDecimals(tokenA);
    const decB = await getDecimals(tokenB);
    const amountA = parseUnits(amountAUi, decA);
    const amountB = parseUnits(amountBUi, decB);

    // Asegurar allowance del token A hacia el contrato TokenSwap
    await ensureAllowance(tokenA, account, TOKEN_SWAP_ADDRESS, amountA);

    // Llamar a la sobrecarga correcta usando la firma completa
    let tx;
    if (durationSecs && durationSecs > 0) {
      const createWithDuration = (swapWrite as any).getFunction(
        "createOperation(address,address,uint256,uint256,uint256)"
      );
      tx = await createWithDuration(
        tokenA,
        tokenB,
        amountA,
        amountB,
        BigInt(durationSecs)
      );
    } else {
      const createDefault = (swapWrite as any).getFunction(
        "createOperation(address,address,uint256,uint256)"
      );
      tx = await createDefault(tokenA, tokenB, amountA, amountB);
    }

    log(`Operation.create → ${tx.hash}`);
    const rcpt = await tx.wait();

    // (Opcional) intentar detectar el evento de creación
    try {
      // Si deseas parsear el evento, aquí podrías decodificar logs con la ABI.
      const ev = rcpt.logs?.[0];
      if (ev) log(`OperationCreated id detectado en logs`);
    } catch {
      // no-op
    }

    return rcpt; // opcional: devolver el recibo por si la UI lo necesita
  },
  [swapWrite, provider, signer, account, getDecimals, ensureAllowance, log]
);


  const completeOperation = useCallback(
    async (operationId: BigNumberish) => {
      if (!swapWrite || !provider || !signer || !account) throw new Error("Conecta la wallet");
      // leemos op para saber tokenB y amountB a aprobar
      const op = await (swapRead as any).getOperation(operationId);
      const tokenB: string = op.tokenB;
      const amountB: bigint = op.amountB;
      await ensureAllowance(tokenB, account, TOKEN_SWAP_ADDRESS, amountB);

      const tx = await (swapWrite as any).completeOperation(operationId);
      log(`Operation.complete(${operationId}) → ${tx.hash}`);
      await tx.wait();
      log(`Operation ${operationId} completada`);
    },
    [swapWrite, swapRead, provider, signer, account, ensureAllowance, log]
  );

  const cancelOperation = useCallback(
    async (operationId: BigNumberish) => {
      if (!swapWrite) throw new Error("Conecta la wallet");
      const tx = await (swapWrite as any).cancelOperation(operationId);
      log(`Operation.cancel(${operationId}) → ${tx.hash}`);
      await tx.wait();
      log(`Operation ${operationId} cancelada`);
    },
    [swapWrite, log]
  );

  const getAllOperations = useCallback(async (): Promise<Operation[]> => {
    if (!swapRead) return [];
    const raw = await (swapRead as any).getAllOperations();
    const ops: Operation[] = raw.map((r: any) => ({
      id: BigInt(r.id),
      maker: r.maker.toLowerCase(),
      taker: r.taker.toLowerCase(),
      tokenA: r.tokenA.toLowerCase(),
      tokenB: r.tokenB.toLowerCase(),
      amountA: BigInt(r.amountA),
      amountB: BigInt(r.amountB),
      status: statusFromNumber(BigInt(r.status)),
      createdAt: BigInt(r.createdAt),
      completedAt: BigInt(r.completedAt),
      cancelledAt: BigInt(r.cancelledAt),
      expiresAt: BigInt(r.expiresAt),
    }));
    return ops.sort((a, b) => Number(b.id - a.id));
  }, [swapRead]);

  const getUserBalances = useCallback(
    async (user?: string) => {
      if (!swapRead || !provider) return { tokens: [] as string[], balances: [] as string[] };
      const addr = (user || account || "").toLowerCase();
      const ret = await (swapRead as any).getUserBalances(addr);
      const tokens: string[] = ret[0];
      const bals: bigint[] = ret[1];
      // formatear con decimales del token
      const out: string[] = [];
      for (let i = 0; i < tokens.length; i++) {
        const dec = await getDecimals(tokens[i]);
        out.push(formatUnits(bals[i], dec));
      }
      return { tokens, balances: out };
    },
    [swapRead, provider, account, getDecimals]
  );

  // const getEscrowBalances = useCallback(async () => {
  //   if (!provider) return [];
  //   const tokens = Object.values(TOKENS);
  //   const out: { token: string; balance: string }[] = [];
  //   for (const t of tokens) {
  //     const erc = getErc20(t, provider);
  //     const dec = Number(await erc.decimals());
  //     const raw: bigint = await erc.balanceOf(TOKEN_SWAP_ADDRESS);
  //     out.push({ token: t, balance: formatUnits(raw, dec) });
  //   }
  //   return out;
  // }, [provider]);

  

const getEscrowBalances = useCallback(async () => {
  if (!provider || !swapRead) return [];

  // Leer lista y filtrar activos
  const active: string[] = [];
  const tokenList: string[] = await (swapRead as any).getAllowedTokens().catch(() => []);
  for (const t of tokenList) {   
    const ok: boolean = await (swapRead as any).allowedToken(t).catch(() => false);
    if (ok) active.push(t);
  }

  // Si no hay activos, devuelve vacío (la UI debe reflejarlo)
  if (active.length === 0) return [];

  // Construir balances del escrow
  const out: { token: string; balance: string }[] = [];
  for (const t of active) {
    try {
      const erc = getErc20(t, provider);
      const dec = Number(await erc.decimals().catch(() => 18));
      const raw: bigint = await erc.balanceOf(TOKEN_SWAP_ADDRESS).catch(() => 0n);
      out.push({ token: t, balance: formatUnits(raw, dec) });
    } catch {
      // token inválido o RPC falló → omitir
    }
  }
  return out;
}, [provider, swapRead]);




  
// src/lib/useScrowHelper.ts (dentro del hook)
const getTokenInfo = useCallback(
  async (address: string): Promise<{ name: string; symbol: string; decimals: number } | null> => {
    try {
      if (!provider) throw new Error("Provider no disponible");
      const erc = getErc20(address, provider);
      const [name, symbol, decimals] = await Promise.all([
        erc.name(),      // ERC20Metadata
        erc.symbol(),    // ERC20Metadata
        erc.decimals(),  // ERC20Metadata
      ]);
      return { name, symbol, decimals: Number(decimals) };
    } catch (err) {
      // Fallback si el token no implementa metadata o falla la llamada
      return null;
    }
  },
  [provider]
);


  return {
    account,
    logs,
    addToken,
    getActiveAllowedTokens,
    createOperation,
    completeOperation,
    cancelOperation,
    getAllOperations,
    getUserBalances,
    getEscrowBalances,
    fetchOwner,
    getTokenInfo
  };
};
