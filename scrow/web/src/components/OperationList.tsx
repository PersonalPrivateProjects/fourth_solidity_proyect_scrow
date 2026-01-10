
// src/components/OperationList.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Operation } from "@/src/lib/useScrowHelper";
import { useScrowHelper } from "@/src/lib/useScrowHelper";
import { useWeb3 } from "@/src/lib/ethereum";
import { formatDistanceToNow } from "date-fns";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function truncate(addr: string, start = 6, end = 4) {
  if (!addr) return "-";
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}

function StatusBadge({ status }: { status: Operation["status"] }) {
  const classes =
    status === "Open"
      ? "bg-green-500/15 text-green-400 border-green-600/30"
      : status === "Completed"
      ? "bg-blue-500/15 text-blue-400 border-blue-600/30"
      : "bg-red-500/15 text-red-400 border-red-600/30";

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] border ${classes}`}>
      {status}
    </span>
  );
}

type TokenInfo = { name: string; symbol: string; decimals: number } | null;

export default function OperationList() {
  const { account, chainId } = useWeb3();
  const {
    getAllOperations,
    completeOperation,
    cancelOperation,
    getTokenInfo, // ⬅️ usamos metadata del token
  } = useScrowHelper();

  const [ops, setOps] = useState<Operation[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<bigint | null>(null);

  // Cache de metadata por address (lowercase)
  const [tokenInfoByAddr, setTokenInfoByAddr] = useState<Record<string, TokenInfo>>({});

  // ==== control de carreras / estado ====
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);
  const intervalRef = useRef<number | null>(null);
  const lastNonEmptyRef = useRef<Operation[]>([]);

  const refresh = async () => {
    const myReqId = ++reqIdRef.current;
    setRefreshing(true);
    try {
      const all = await getAllOperations();
      if (!mountedRef.current || myReqId !== reqIdRef.current) return;

      if (all.length === 0 && lastNonEmptyRef.current.length > 0) {
        return; // ignora vacío transitorio
      }

      setOps(all);
      if (all.length > 0) {
        lastNonEmptyRef.current = all;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("getAllOperations failed:", err);
    } finally {
      if (myReqId === reqIdRef.current) {
        setRefreshing(false);
      }
    }
  };

  // Montaje + autorefresh alineado con cuenta/red y visibilidad
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
  }, [account, chainId]); // re-arma interval cuando cambian cuenta/red

  const open = useMemo(() => ops.filter((o) => o.status === "Open"), [ops]);
  const done = useMemo(() => ops.filter((o) => o.status === "Completed"), [ops]);
  const canc = useMemo(() => ops.filter((o) => o.status === "Cancelled"), [ops]);

  const canCancel = (o: Operation) => account && o.status === "Open" && o.maker === account;
  const canComplete = (o: Operation) => account && o.status === "Open" && o.maker !== account;

  const wrapComplete = async (id: bigint) => {
    try {
      setBusyId(id);
      await completeOperation(id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const wrapCancel = async (id: bigint) => {
    try {
      setBusyId(id);
      await cancelOperation(id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  // === Precarga metadata de tokens presentes en las operaciones ===
  const uniqueTokenAddrs = useMemo(() => {
    const set = new Set<string>();
    for (const o of ops) {
      set.add(o.tokenA.toLowerCase());
      set.add(o.tokenB.toLowerCase());
    }
    return Array.from(set);
  }, [ops]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (uniqueTokenAddrs.length === 0) return;

      const toFetch = uniqueTokenAddrs.filter(
        (addr) => tokenInfoByAddr[addr] === undefined // sólo los no cacheados
      );

      if (toFetch.length === 0) return;

      const entries: [string, TokenInfo][] = [];
      for (const addr of toFetch) {
        try {
          const info = await getTokenInfo(addr);
          entries.push([addr, info]); // puede ser null si no hay metadata
        } catch {
          entries.push([addr, null]);
        }
      }

      if (!alive) return;
      setTokenInfoByAddr((prev) => {
        const next = { ...prev };
        for (const [addr, info] of entries) {
          next[addr] = info;
        }
        return next;
      });
    })();

    return () => {
      alive = false;
    };
  }, [uniqueTokenAddrs, getTokenInfo, tokenInfoByAddr]);

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-sm backdrop-blur p-6 space-y-6 transition hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500" />
          <div className="leading-tight">
            <h3 className="text-lg font-semibold">Operaciones</h3>
            <p className="text-xs text-zinc-400">Abiertas · Completadas · Canceladas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded-full text-[10px] border bg-zinc-800 text-zinc-300 border-zinc-700">
            auto 8s
          </span>
          <button
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 hover:border-indigo-500 hover:text-indigo-300 transition"
            onClick={refresh}
            disabled={refreshing}
          >
            {refreshing ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-current/60 border-t-transparent animate-spin" />
                Refrescando…
              </>
            ) : (
              <>
                {/* Refresh icon */}
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M4 4v6h6M20 20v-6h-6" />
                  <path d="M5 10a7 7 0 0112-3M19 14a7 7 0 01-12 3" />
                </svg>
                Refrescar
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sections */}
      <Section
        title="Abiertas"
        items={open}
        canCancel={canCancel}
        canComplete={canComplete}
        busyId={busyId}
        onCancel={wrapCancel}
        onComplete={wrapComplete}
        tokenInfoByAddr={tokenInfoByAddr} // ⬅️ pasamos metadata
      />

      <Section title="Completadas" items={done} tokenInfoByAddr={tokenInfoByAddr} />
      <Section title="Canceladas" items={canc} tokenInfoByAddr={tokenInfoByAddr} />
    </div>
  );
}

function Section({
  title,
  items,
  canCancel,
  canComplete,
  onCancel,
  onComplete,
  busyId,
  tokenInfoByAddr,
}: {
  title: string;
  items: Operation[];
  canCancel?: (o: Operation) => boolean;
  canComplete?: (o: Operation) => boolean;
  onCancel?: (id: bigint) => Promise<void>;
  onComplete?: (id: bigint) => Promise<void>;
  busyId?: bigint | null;
  tokenInfoByAddr: Record<string, TokenInfo>;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">
          {title} <span className="text-xs text-zinc-500">({items.length})</span>
        </h4>
      </div>

      <div className="max-h-96 overflow-auto space-y-2 pr-1">
        {items.length === 0 ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-500">
            Sin elementos
          </div>
        ) : (
          items.map((o) => {
            const expiresMs = Number(o.expiresAt) * 1000;
            const createdMs = Number(o.createdAt) * 1000;
            const isExpired = Date.now() > expiresMs;
            const working = busyId === o.id;

            const aAddr = o.tokenA.toLowerCase();
            const bAddr = o.tokenB.toLowerCase();
            const infoA = tokenInfoByAddr[aAddr];
            const infoB = tokenInfoByAddr[bAddr];

            const labelSymbolA =
              infoA?.symbol?.trim() || truncate(o.tokenA, 6, 6);
            const labelSymbolB =
              infoB?.symbol?.trim() || truncate(o.tokenB, 6, 6);
            const labelNameA = infoA?.name?.trim() || "";
            const labelNameB = infoB?.name?.trim() || "";

            return (
              <div
                key={o.id.toString()}
                className="p-4 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-indigo-500/50 transition flex flex-col md:flex-row md:items-center md:justify-between gap-3"
              >
                {/* Left: meta */}
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-indigo-400">#{o.id.toString()}</span>
                    <StatusBadge status={o.status} />
                    {isExpired && o.status === "Open" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] border bg-red-500/10 text-red-400 border-red-600/30">
                        expirada
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-zinc-400">
                    Maker:{" "}
                    <span className="font-mono text-zinc-300">{truncate(o.maker)}</span> | Taker:{" "}
                    <span className="font-mono text-zinc-300">
                      {o.taker !== ZERO_ADDR ? truncate(o.taker) : "-"}
                    </span>
                  </div>

                  {/* Línea de tokens con etiquetas dinámicas */}
                  <div className="text-xs text-zinc-500">
                    {/* Token A */}
                    <span
                      className="inline-flex items-center gap-1"
                      title={`${labelNameA || labelSymbolA} — ${truncate(o.tokenA, 6, 6)}`}
                    >
                      <span className="font-mono">{labelSymbolA}</span>{" "}
                      <span className="text-zinc-400">({truncate(o.tokenA, 6, 6)})</span>
                      <span className="mx-1">→</span>
                      <span className="font-mono">{o.amountA.toString()}</span>
                    </span>

                    <span className="mx-2">|</span>

                    {/* Token B */}
                    <span
                      className="inline-flex items-center gap-1"
                      title={`${labelNameB || labelSymbolB} — ${truncate(o.tokenB, 6, 6)}`}
                    >
                      <span className="font-mono">{labelSymbolB}</span>{" "}
                      <span className="text-zinc-400">({truncate(o.tokenB, 6, 6)})</span>
                      <span className="mx-1">→</span>
                      <span className="font-mono">{o.amountB.toString()}</span>
                    </span>
                  </div>

                  <div className="text-xs text-zinc-500">
                    Creado: {formatDistanceToNow(createdMs, { addSuffix: true })} · {" Expires: "}
                    {new Date(expiresMs).toLocaleString()}
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex gap-2">
                  {canComplete && canComplete(o) && onComplete && (
                    <button
                      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        working ? "bg-green-700 text-white cursor-wait" : "bg-green-600 text-white hover:bg-green-500"
                      }`}
                      onClick={() => onComplete(o.id)}
                      disabled={working}
                    >
                      {working ? (
                        <>
                          <span className="h-3.5 w-3.5 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
                          Procesando…
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                          Completar
                        </>
                      )}
                    </button>
                  )}

                  {canCancel && canCancel(o) && onCancel && (
                    <button
                      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition ${
                        working ? "bg-amber-700 text-white cursor-wait" : "bg-amber-600 text-white hover:bg-amber-500"
                      }`}
                      onClick={() => onCancel(o.id)}
                      disabled={working}
                    >
                      {working ? (
                        <>
                          <span className="h-3.5 w-3.5 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
                          Cancelando…
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                          Cancelar
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

