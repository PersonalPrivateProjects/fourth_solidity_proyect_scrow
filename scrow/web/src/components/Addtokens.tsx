
// src/components/AddTokens.tsx
"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/src/lib/ethereum";
import { useScrowHelper } from "@/src/lib/useScrowHelper";
import { useMockERC } from "@/src/lib/useMockERC";

function truncate(addr: string, start = 6, end = 6) {
  if (!addr) return "-";
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}

type TokenMeta = { address: string; name?: string; symbol?: string; decimals?: number };

// Normaliza para comparación case-insensitive y sin espacios
const normalize = (s?: string) => (s || "").trim().toLowerCase();

export default function AddTokens() {
  const { account, chainId } = useWeb3();
  const {
    addToken,
    fetchOwner,
    getActiveAllowedTokens,
    getTokenInfo: getTokenInfoSwap,
    // (Opcional) si más adelante expones subscribeSwapEvents() aquí, podemos usarlo
  } = useScrowHelper();
  const { deployMockERC20 } = useMockERC();

  // Estado de owner / vista
  const [owner, setOwner] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);

  // Tokens permitidos actuales
  const [allowed, setAllowed] = useState<TokenMeta[]>([]);
  const [loadingAllowed, setLoadingAllowed] = useState(false);

  // UI de creación / agregado
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [tokenAddress, setTokenAddress] = useState("");
  const [deploying, setDeploying] = useState(false);
  const [adding, setAdding] = useState(false);

  // Copiar a clipboard
  const [copiedOwner, setCopiedOwner] = useState(false);
  const [copiedAccount, setCopiedAccount] = useState(false);

  // Control de carreras y autorefresh
  const reqIdRef = useRef(0);
  const mountedRef = useRef(true);
  const intervalRef = useRef<number | null>(null);

  // Resolver owner y si el account actual es owner
  useEffect(() => {
    (async () => {
      const o = await fetchOwner(); // el hook devuelve lowercase
      setOwner(o);
      setIsOwner(!!account && !!o && o === account.toLowerCase());
    })();
  }, [account, fetchOwner]);

  // Cargar tokens permitidos actuales + metadata (con useCallback para identidad estable)
  const loadAllowed = useCallback(async () => {
    const myReqId = ++reqIdRef.current;
    setLoadingAllowed(true);
    try {
      const addrs = await getActiveAllowedTokens(); // on-chain
      const metas: TokenMeta[] = [];
      for (const a of addrs) {
        const meta = await getTokenInfoSwap(a);
        metas.push({
          address: a,
          name: meta?.name,
          symbol: meta?.symbol,
          decimals: meta?.decimals,
        });
      }
      if (!mountedRef.current || myReqId !== reqIdRef.current) return; // evita sobrescribir con respuestas viejas
      setAllowed(metas);
    } finally {
      if (myReqId === reqIdRef.current) {
        setLoadingAllowed(false);
      }
    }
  }, [getActiveAllowedTokens, getTokenInfoSwap]);

  // Carga inicial y relanzar cuando el contrato se pone listo (cambia getActiveAllowedTokens)
  useEffect(() => {
    mountedRef.current = true;

    // Primera carga
    loadAllowed();

    // Limpieza al desmontar
    return () => {
      mountedRef.current = false;
    };
  }, [loadAllowed]);

  // Autorefresh cada 8s; pausado cuando la pestaña está oculta
  useEffect(() => {
    // limpia cualquier intervalo previo
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    intervalRef.current = window.setInterval(() => {
      if (!loadingAllowed) {
        loadAllowed();
      }
    }, 8000);

    const handleVisibility = () => {
      if (document.hidden && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      } else if (!document.hidden && !intervalRef.current) {
        intervalRef.current = window.setInterval(() => {
          if (!loadingAllowed) {
            loadAllowed();
          }
        }, 8000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [loadAllowed, loadingAllowed]);

  // === Sets para validación de duplicados (UI) ===
  const allowedNameSet = useMemo(() => {
    const s = new Set<string>();
    for (const t of allowed) {
      const n = normalize(t.name);
      if (n) s.add(n);
    }
    return s;
  }, [allowed]);

  const allowedSymbolSet = useMemo(() => {
    const s = new Set<string>();
    for (const t of allowed) {
      const sym = normalize(t.symbol);
      if (sym) s.add(sym);
    }
    return s;
  }, [allowed]);

  const allowedAddrSet = useMemo(
    () => new Set(allowed.map((t) => t.address.toLowerCase())),
    [allowed]
  );

  // Flags de duplicado para los inputs de creación
  const duplicateName = useMemo(
    () => allowedNameSet.has(normalize(name)),
    [allowedNameSet, name]
  );
  const duplicateSymbol = useMemo(
    () => allowedSymbolSet.has(normalize(symbol)),
    [allowedSymbolSet, symbol]
  );

  // Habilitaciones de botones
  const canDeploy = useMemo(
    () => !!isOwner && !!name.trim() && !!symbol.trim() && !duplicateName && !duplicateSymbol,
    [isOwner, name, symbol, duplicateName, duplicateSymbol]
  );

  const canAdd = useMemo(
    () => !!isOwner && !!tokenAddress && ethers.isAddress(tokenAddress),
    [isOwner, tokenAddress]
  );

  const onDeploy = async () => {
    try {
      if (!isOwner) return alert("Solo el owner del contrato puede crear tokens");
      if (!canDeploy) {
        if (!name.trim() || !symbol.trim()) return;
        if (duplicateName) return alert(`El nombre "${name}" ya está en uso en el TokenSwap`);
        if (duplicateSymbol) return alert(`El símbolo "${symbol}" ya está en uso en el TokenSwap`);
        return;
      }
      setDeploying(true);

      // Revalida owner on-chain y normaliza direcciones
      const fetchedOwner = owner || (await fetchOwner());
      const acc = account?.toLowerCase();
      const own = fetchedOwner?.toLowerCase();

      if (!acc || !own || acc !== own) {
        alert(`Conecta la wallet del owner (${owner ?? "desconocido"}) para continuar`);
        return;
      }

      const addr = await deployMockERC20(name, symbol, own /* requiredOwner */);
      setTokenAddress(addr);
      alert(`Token desplegado en: ${addr}`);
    } catch (e: any) {
      alert(e?.message || "Error al desplegar token");
    } finally {
      setDeploying(false);
    }
  };

  const onAddToSwap = async () => {
    try {
      if (!isOwner) return alert("Solo el owner del contrato puede agregar tokens");
      if (!canAdd) return alert("Dirección de token inválida");

      const addrLc = tokenAddress.toLowerCase();

      // Evita agregar el mismo address
      if (allowedAddrSet.has(addrLc)) {
        return alert("Este token ya está agregado al TokenSwap.");
      }

      // Lee metadata del token para validar duplicados por name/symbol
      const meta = await getTokenInfoSwap(tokenAddress);
      if (!meta) {
        return alert("El token no expone metadata ERC20 (name/symbol), no se puede validar.");
      }

      const n = normalize(meta.name);
      const s = normalize(meta.symbol);

      if (allowedNameSet.has(n)) {
        return alert(`Ya existe un token con el nombre: ${meta.name}`);
      }
      if (allowedSymbolSet.has(s)) {
        return alert(`Ya existe un token con el símbolo: ${meta.symbol}`);
      }

      setAdding(true);
      await addToken(tokenAddress);
      await loadAllowed(); // refrescar tarjetas inmediatamente
      alert("Token agregado a TokenSwap");
    } catch (e: any) {
      alert(e?.message || "Error al agregar token");
    } finally {
      setAdding(false);
    }
  };

  const copy = async (text: string, which: "owner" | "account") => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "owner") {
        setCopiedOwner(true);
        setTimeout(() => setCopiedOwner(false), 1400);
      } else {
        setCopiedAccount(true);
        setTimeout(() => setCopiedAccount(false), 1400);
      }
    } catch {}
  };

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-sm backdrop-blur p-6 space-y-6 transition hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="leading-tight">
          <h3 className="text-lg font-semibold">Gestionar tokens permitidos</h3>
          <p className="text-xs text-zinc-400">Owner-gated · Red: {chainId ?? "-"}</p>
        </div>
        <span
          className={`px-2 py-1 rounded-full text-[10px] border ${
            isOwner
              ? "bg-green-500/10 text-green-400 border-green-600/30"
              : "bg-red-500/10 text-red-400 border-red-600/30"
          }`}
        >
          {isOwner ? "Eres el owner" : "No autorizado"}
        </span>
      </div>

      {/* Owner & Account panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3">
          <div className="text-xs text-zinc-500 mb-1">Owner del TokenSwap</div>
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-sm text-zinc-200">
              {owner ? truncate(owner) : "-"}
            </div>
            {owner && (
              <button
                onClick={() => copy(owner, "owner")}
                className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                title="Copiar address del owner"
              >
                {copiedOwner ? (
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

        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3">
          <div className="text-xs text-zinc-500 mb-1">Tu cuenta</div>
          <div className="flex items-center justify-between gap-2">
            <div className="font-mono text-sm text-zinc-200">
              {account ? truncate(account) : "-"}
            </div>
            {account && (
              <button
                onClick={() => copy(account, "account")}
                className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                title="Copiar tu address"
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
      </div>

      {/* Lista de tokens permitidos actuales */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Tokens permitidos actuales</div>
          <button
            onClick={loadAllowed}
            disabled={loadingAllowed}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-200 hover:border-indigo-500 hover:text-indigo-300 transition"
          >
            {loadingAllowed ? (
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {allowed.length === 0 ? (
            <div className="col-span-full rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-500">
              No hay tokens registrados aún.
            </div>
          ) : (
            allowed.map((t) => (
              <div
                key={t.address}
                className="p-4 rounded-lg bg-zinc-900/60 border border-zinc-800 hover:border-indigo-500/50 transition"
                title={t.address}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs text-zinc-500">Token</div>
                  {t.symbol && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] border bg-indigo-500/10 text-indigo-300 border-indigo-600/30">
                      {t.symbol}
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-sm text-zinc-300">{truncate(t.address, 6, 6)}</div>
                {(t.name || typeof t.decimals === "number") && (
                  <div className="mt-1 text-xs text-zinc-500">
                    {t.name ? t.name : ""} {typeof t.decimals === "number" ? `· ${t.decimals} dec` : ""}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- Sección solo visible para el owner --- */}
      {isOwner && (
        <>
          <div className="h-px bg-zinc-800" />

          {/* Crear nuevo token */}
          <div className="space-y-3">
            <div className="text-sm font-medium">Crear nuevo token (MockERC20)</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <input
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
                  placeholder="Nombre (p.ej., Token X)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                {duplicateName && (
                  <p className="text-xs text-red-400 mt-1">Este nombre ya está en uso en el TokenSwap.</p>
                )}
              </div>
              <div>
                <input
                  className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200"
                  placeholder="Símbolo (p.ej., TKX)"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                />
                {duplicateSymbol && (
                  <p className="text-xs text-red-400 mt-1">Este símbolo ya está en uso en el TokenSwap.</p>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onDeploy}
                disabled={!canDeploy || deploying}
                className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${
                  deploying ? "bg-zinc-800 text-zinc-500 cursor-wait" : "bg-indigo-600 text-white hover:bg-indigo-500"
                }`}
              >
                {deploying ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
                    Desplegando…
                  </>
                ) : (
                  "Desplegar MockERC20"
                )}
              </button>
            </div>

            {/* Mostrar address recién desplegado si existe */}
            {tokenAddress && (
              <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-3">
                <div className="text-xs text-zinc-400">Token desplegado</div>
                <div className="mt-1 flex items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/70 px-3 py-1 font-mono">
                    {truncate(tokenAddress, 6, 6)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Agregar token por address (incluye el recién desplegado) */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Agregar token al TokenSwap</div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3">
              <input
                className="rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 font-mono"
                placeholder="0x… dirección del token"
                value={tokenAddress}
                onChange={(e) => setTokenAddress(e.target.value)}
              />
              <button
                onClick={onAddToSwap}
                disabled={!canAdd || adding}
                className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold ${
                  canAdd ? "bg-violet-600 text-white hover:bg-violet-500" : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {adding ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
                    Agregando…
                  </>
                ) : (
                  "Agregar a TokenSwap"
                )}
              </button>
            </div>
            <p className="text-xs text-zinc-500">
              Solo el owner puede agregar tokens. Tras agregar, se actualiza la lista de arriba.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

