
// src/components/BalanceDebug.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useScrowHelper } from "@/src/lib/useScrowHelper";
import { TOKEN_SWAP_ADDRESS } from "@/src/lib/contracts"; // ⬅️ QUITA TOKENS
import { useWeb3 } from "@/src/lib/ethereum";
import type { Operation } from "@/src/lib/useScrowHelper";
import { formatUnits } from "ethers";
import { formatDistanceToNow } from "date-fns";

function truncate(addr: string, start = 6, end = 6) {
  if (!addr) return "-";
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}


/** Metadata cache type */
type TokenInfo = { name: string; symbol: string; decimals: number } | null;

export default function BalanceDebug() {
  const { account, chainId } = useWeb3();
  const {
    getUserBalances,
    getEscrowBalances,
    logs,
    getAllOperations,
    getTokenInfo,
  } = useScrowHelper();

  const [userBalances, setUserBalances] = useState<{ tokens: string[]; balances: string[] }>({
    tokens: [],
    balances: [],
  });
  const [escrowBalances, setEscrowBalances] = useState<{ token: string; balance: string }[]>([]);
  const [recentOps, setRecentOps] = useState<Operation[]>([]);
  const [tokenInfoByAddr, setTokenInfoByAddr] = useState<Record<string, TokenInfo>>({}); // ⬅️ cache

  const [refreshing, setRefreshing] = useState(false);
  const [copiedContract, setCopiedContract] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  // ==== refresh loop ====
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);
  const intervalRef = useRef<number | null>(null);

  const refresh = async () => {
    const myReqId = ++reqIdRef.current;
    setRefreshing(true);
    try {
      const [ub, eb, allOps] = await Promise.all([
        getUserBalances(account ?? undefined),
        getEscrowBalances(),
        getAllOperations(),
      ]);

      if (!mountedRef.current || myReqId !== reqIdRef.current) return;

      setUserBalances(ub);
      setEscrowBalances(eb);

      const latest = allOps.slice(0, 10);
      setRecentOps(latest);
    } catch (err) {
      console.error("refresh error:", err);
    } finally {
      if (myReqId === reqIdRef.current) {
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;

    refresh();

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (account && chainId) {
      intervalRef.current = window.setInterval(() => {
        if (!refreshing) refresh();
      }, 8000);
    }

    const handleVisibility = () => {
      if (document.hidden && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      } else if (!document.hidden && account && chainId && !intervalRef.current) {
        intervalRef.current = window.setInterval(() => {
          if (!refreshing) refresh();
        }, 8000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [account, chainId]);

  const copyContract = async () => {
    try {
      await navigator.clipboard.writeText(TOKEN_SWAP_ADDRESS);
      setCopiedContract(true);
      setTimeout(() => setCopiedContract(false), 1500);
    } catch {}
  };

  const copyAccount = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 1500);
    } catch {}
  };

  // === Precarga metadata para tokens usados en RECENT OPS (ya lo tenías) ===
  useEffect(() => {
    let alive = true;
    (async () => {
      if (recentOps.length === 0) return;
      const addrs = new Set<string>();
      for (const o of recentOps) {
        addrs.add(o.tokenA.toLowerCase());
        addrs.add(o.tokenB.toLowerCase());
      }
      const toFetch = Array.from(addrs).filter((addr) => tokenInfoByAddr[addr] === undefined);
      if (toFetch.length === 0) return;

      const entries: [string, TokenInfo][] = [];
      for (const addr of toFetch) {
        try {
          const info = await getTokenInfo(addr);
          entries.push([addr, info]);
        } catch {
          entries.push([addr, null]);
        }
      }

      if (!alive) return;
      setTokenInfoByAddr((prev) => {
        const next = { ...prev };
        for (const [addr, info] of entries) next[addr] = info;
        return next;
      });
    })();
    return () => {
      alive = false;
    };
  }, [recentOps, getTokenInfo, tokenInfoByAddr]);

  // === Precarga metadata para tokens en ESCROW y en USER BALANCES ===
  useEffect(() => {
    let alive = true;
    (async () => {
      const addrs = new Set<string>();

      // tokens del escrow
      for (const b of escrowBalances) {
        if (b?.token) addrs.add(b.token.toLowerCase());
      }
      // tokens del usuario
      for (const t of userBalances.tokens) {
        if (t) addrs.add(t.toLowerCase());
      }

      const toFetch = Array.from(addrs).filter((addr) => tokenInfoByAddr[addr] === undefined);
      if (toFetch.length === 0) return;

      const entries: [string, TokenInfo][] = [];
      for (const addr of toFetch) {
        try {
          const info = await getTokenInfo(addr);
          entries.push([addr, info]);
        } catch {
          entries.push([addr, null]);
        }
      }

      if (!alive) return;
      setTokenInfoByAddr((prev) => {
        const next = { ...prev };
        for (const [addr, info] of entries) next[addr] = info;
        return next;
      });
    })();

    return () => {
      alive = false;
    };
  }, [escrowBalances, userBalances.tokens, getTokenInfo, tokenInfoByAddr]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-sm backdrop-blur p-6 space-y-6 transition hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500" />
          <div className="leading-tight">
            <h3 className="text-lg font-semibold">Balance &amp; Debug</h3>
            <p className="text-xs text-zinc-400">Estado del contrato y tus fondos</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded-full text-[10px] border bg-zinc-800 text-zinc-300 border-zinc-700">
            auto 8s
          </span>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 hover:border-indigo-500 hover:text-indigo-300 transition"
          >
            {refreshing ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-current/60 border-t-transparent animate-spin" />
                Refrescando…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M4 4v6h6M20 20v-6h-6" />
                  <path d="M5 10a7 7 0 0112-3M19 14a7 7 0 01-12 3" />
                </svg>
                Refrescar
              </>
            )}
          </button>
        </div>
      </div>

      {/* Escrow balances */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="leading-tight">
            <div className="text-sm font-medium">Contrato TokenSwap (escrow)</div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-300">{truncate(TOKEN_SWAP_ADDRESS)}</span>
              <button
                onClick={copyContract}
                className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition"
                title="Copiar dirección del contrato"
              >
                {copiedContract ? (
                  <>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Copiado
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <rect x="3" y="3" width="13" height="13" rx="2" />
                    </svg>
                    Copiar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {escrowBalances.map((b) => {
            const info = tokenInfoByAddr[b.token.toLowerCase()];
            const labelSymbol = info?.symbol?.trim() || truncate(b.token, 6, 6);
            const labelName = info?.name?.trim() || "";
            const labelDecs = typeof info?.decimals === "number" ? info!.decimals : undefined;

            return (
              <div
                key={b.token}
                className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-indigo-500/50 transition"
                title={b.token}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-500">Token</div>
                  {/* Badge dinámico con symbol */}
                  <span className="px-2 py-0.5 rounded-full text-[10px] border bg-indigo-500/10 text-indigo-300 border-indigo-600/30">
                    {labelSymbol}
                  </span>
                </div>

                {/* Address truncado */}
                <div className="mt-1 font-mono text-sm break-all text-zinc-300">
                  {truncate(b.token, 6, 6)}
                </div>

                {/* Línea secundaria: name + decimals (si existen) */}
                {(labelName || labelDecs !== undefined) && (
                  <div className="mt-1 text-xs text-zinc-500">
                    {labelName ? labelName : ""}
                    {labelDecs !== undefined ? ` · ${labelDecs} dec` : ""}
                  </div>
                )}

                <div className="mt-3 text-xs text-zinc-500">Balance contrato</div>
                <div className="font-semibold">{b.balance}</div>
              </div>
            );
          })}
          {escrowBalances.length === 0 && (
            <div className="col-span-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-500">
              Sin balances en el contrato. Agrega tokens permitidos (owner) para iniciar.
            </div>
          )}
        </div>
      </div>

      {/* User balances */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="leading-tight">
            <div className="text-sm font-medium">
              Tus balances (cuenta: {account ? truncate(account) : "-"})
            </div>
            {account && (
              <button
                onClick={copyAccount}
                className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition mt-1"
                title="Copiar tu dirección"
              >
                {copiedAccount ? (
                  <>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Copiado
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                      <rect x="9" y="9" width="13" height="13" rx="2" />
                      <rect x="3" y="3" width="13" height="13" rx="2" />
                    </svg>
                    Copiar
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {userBalances.tokens.map((t, i) => {
            const info = tokenInfoByAddr[t.toLowerCase()];
            const labelSymbol = info?.symbol?.trim() || truncate(t, 6, 6);
            const labelName = info?.name?.trim() || "";
            const labelDecs = typeof info?.decimals === "number" ? info!.decimals : undefined;

            return (
              <div
                key={t}
                className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-indigo-500/50 transition"
                title={t}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-500">Token</div>
                  {/* Badge dinámico con symbol */}
                  <span className="px-2 py-0.5 rounded-full text-[10px] border bg-indigo-500/10 text-indigo-300 border-indigo-600/30">
                    {labelSymbol}
                  </span>
                </div>

                <div className="mt-1 font-mono text-sm break-all text-zinc-300">
                  {truncate(t, 6, 6)}
                </div>

                {(labelName || labelDecs !== undefined) && (
                  <div className="mt-1 text-xs text-zinc-500">
                    {labelName ? labelName : ""}
                    {labelDecs !== undefined ? ` · ${labelDecs} dec` : ""}
                  </div>
                )}

                <div className="mt-3 text-xs text-zinc-500">Balance</div>
                <div className="font-semibold">{userBalances.balances[i]}</div>
              </div>
            );
          })}
          {userBalances.tokens.length === 0 && (
            <div className="col-span-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-500">
              No se encontraron balances. Conecta tu wallet o agrega tokens permitidos.
            </div>
          )}
        </div>
      </div>

      {/* Actividad reciente */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Actividad reciente</div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="max-h-48 overflow-auto text-xs font-mono space-y-2 pr-1">
            {recentOps.length === 0 ? (
              <div className="text-zinc-500">Sin actividad.</div>
            ) : (
              recentOps.map((o) => {
                const aAddr = o.tokenA.toLowerCase();
                const bAddr = o.tokenB.toLowerCase();
                const infoA = tokenInfoByAddr[aAddr];
                const infoB = tokenInfoByAddr[bAddr];

                const decA = infoA?.decimals ?? 18;
                const decB = infoB?.decimals ?? 18;
                const uiAmountA = formatUnits(o.amountA, decA);
                const uiAmountB = formatUnits(o.amountB, decB);

                const labelSymbolA = infoA?.symbol?.trim() || truncate(o.tokenA, 6, 6);
                const labelSymbolB = infoB?.symbol?.trim() || truncate(o.tokenB, 6, 6);
                const labelNameA = infoA?.name?.trim() || "";
                const labelNameB = infoB?.name?.trim() || "";

                const createdMs = Number(o.createdAt) * 1000;

                return (
                  <div key={o.id.toString()} className="flex flex-wrap items-center gap-1">
                    <span className="text-indigo-300">#{o.id.toString()}</span>
                    <span>· {o.status}</span>
                    <span
                      className="inline-flex items-center gap-1"
                      title={`${labelNameA || labelSymbolA} — ${truncate(o.tokenA, 6, 6)}`}
                    >
                      · A:{labelSymbolA} → {uiAmountA}
                    </span>
                    <span
                      className="inline-flex items-center gap-1"
                      title={`${labelNameB || labelSymbolB} — ${truncate(o.tokenB, 6, 6)}`}
                    >
                      · B:{labelSymbolB} → {uiAmountB}
                    </span>
                    <span>· maker:{truncate(o.maker)}</span>
                    <span>· taker:{o.taker !== "0x0000000000000000000000000000000000000000" ? truncate(o.taker) : "-"}</span>
                    <span>· {formatDistanceToNow(createdMs, { addSuffix: true })}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
