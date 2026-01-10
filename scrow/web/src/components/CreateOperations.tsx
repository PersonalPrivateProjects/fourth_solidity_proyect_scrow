
// src/components/CreateOperations.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useScrowHelper } from "@/src/lib/useScrowHelper";
import { useWeb3 } from "@/src/lib/ethereum";

function truncate(addr: string, start = 6, end = 4) {
  if (!addr) return "-";
  return `${addr.slice(0, start)}…${addr.slice(-end)}`;
}

function secondsToHuman(s: number) {
  if (!s || s < 0) return "-";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const out: string[] = [];
  if (d) out.push(`${d}d`);
  if (h) out.push(`${h}h`);
  if (m) out.push(`${m}m`);
  if (out.length === 0) out.push(`${s}s`);
  return out.join(" ");
}

export default function CreateOperations() {
  const { account } = useWeb3();
  const { getActiveAllowedTokens, createOperation, getTokenInfo } = useScrowHelper();

  const [tokens, setTokens] = useState<string[]>([]);
  const [tokenA, setTokenA] = useState<string>("");
  const [tokenB, setTokenB] = useState<string>("");
  const [amountA, setAmountA] = useState<string>("0");
  const [amountB, setAmountB] = useState<string>("0");
  const [duration, setDuration] = useState<number>(24 * 3600);
  const [submitting, setSubmitting] = useState(false);

  // Metadata del token seleccionado (para etiquetas)
  const [tokenInfoA, setTokenInfoA] = useState<{ name: string; symbol: string; decimals: number } | null>(null);
  const [tokenInfoB, setTokenInfoB] = useState<{ name: string; symbol: string; decimals: number } | null>(null);

  useEffect(() => {
    (async () => {
      const ts = await getActiveAllowedTokens();
      setTokens(ts);
      if (ts.length >= 2) {
        setTokenA(ts[0]);
        setTokenB(ts[1]);
      } else if (ts.length === 1) {
        setTokenA(ts[0]);
        setTokenB(""); // no hay B disponible
      } else {
        setTokenA("");
        setTokenB("");
      }
    })();
  }, [getActiveAllowedTokens]);

  // Mantener B distinto de A si A cambia
  useEffect(() => {
    if (!tokenA) return;
    if (!tokenB || tokenA.toLowerCase() === tokenB.toLowerCase()) {
      const candidate = tokens.find((t) => t.toLowerCase() !== tokenA.toLowerCase()) || "";
      setTokenB(candidate);
    }
  }, [tokenA, tokens]); // cuando cambian tokens o seleccionas A, recalcula B si hace falta

  // Cargar metadata para A/B cuando cambian
  useEffect(() => {
    let alive = true;
    (async () => {
      if (tokenA) {
        const infoA = await getTokenInfo(tokenA);
        if (alive) setTokenInfoA(infoA);
      } else {
        setTokenInfoA(null);
      }
      if (tokenB) {
        const infoB = await getTokenInfo(tokenB);
        if (alive) setTokenInfoB(infoB);
      } else {
        setTokenInfoB(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tokenA, tokenB, getTokenInfo]);

  const amountsValid = useMemo(() => {
    const a = Number(amountA);
    const b = Number(amountB);
    return Number.isFinite(a) && a > 0 && Number.isFinite(b) && b > 0;
  }, [amountA, amountB]);

  const tokensValid = useMemo(() => {
    return tokenA && tokenB && tokenA.toLowerCase() !== tokenB.toLowerCase();
  }, [tokenA, tokenB]);

  const durationValid = duration >= 3600;

  const canCreate =
    !!account && tokensValid && amountsValid && durationValid && !submitting;

  const onCreate = async () => {
    if (!account) return alert("Conecta la wallet");
    if (!tokensValid) return alert("Selecciona tokens distintos");
    if (!amountsValid) return alert("Ingresa montos válidos (> 0)");
    if (!durationValid) return alert("La duración mínima es 3600 segundos");
    try {
      setSubmitting(true);
      await createOperation(tokenA, tokenB, amountA, amountB, duration);
      setAmountA("0");
      setAmountB("0");
    } finally {
      setSubmitting(false);
    }
  };

  const swapTokens = () => {
    if (!tokenA || !tokenB) return;
    setTokenA(tokenB);
    setTokenB(tokenA);
    // Opcional: también podrías intercambiar montos si tiene sentido:
    // setAmountA(amountB);
    // setAmountB(amountA);
  };

  // Etiquetas dinámicas (symbol si hay, si no name, si no address truncada)
  const labelSuffixA =
    tokenInfoA?.symbol?.trim() ||
    tokenInfoA?.name?.trim() ||
    (tokenA ? truncate(tokenA, 6, 6) : "");
  const labelSuffixB =
    tokenInfoB?.symbol?.trim() ||
    tokenInfoB?.name?.trim() ||
    (tokenB ? truncate(tokenB, 6, 6) : "");

    
const labelNameA = tokenInfoA?.name?.trim() || "";
const labelNameB = tokenInfoB?.name?.trim() || "";


  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 shadow-sm backdrop-blur p-6 space-y-6 transition hover:shadow-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500" />
          <div className="leading-tight">
            <h3 className="text-lg font-semibold">Crear operación</h3>
            <p className="text-xs text-zinc-400">
              Configura el par y los montos del swap (ERC-20)
            </p>
          </div>
        </div>
        <span
          className={`px-2 py-1 rounded-full text-[10px] border ${
            account
              ? "bg-green-500/10 text-green-400 border-green-600/30"
              : "bg-yellow-500/10 text-yellow-300 border-yellow-600/30"
          }`}
        >
          {account ? "wallet conectada" : "conecta tu wallet"}
        </span>
      </div>

      {/* Token selectors */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4">
        {/* Token A */}
        <div className="space-y-2">
          <label className="text-sm text-zinc-400">
           {labelNameA} (ofreces){labelSuffixA ? ` — ${labelSuffixA}` : ""}
          </label>
          <select
            className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500 focus:ring-2 ring-indigo-500/30 transition"
            value={tokenA}
            onChange={(e) => setTokenA(e.target.value)}
          >
            {tokens.map((t) => (
              <option key={t} value={t}>
                {truncate(t)}
              </option>
            ))}
          </select>
          <input
            className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-indigo-500 focus:ring-2 ring-indigo-500/30 transition"
            type="number"
            min="0"
            step="any"
            value={amountA}
            onChange={(e) => setAmountA(e.target.value)}
            placeholder="Monto A"
          />
        </div>

        {/* Swap button */}
        <div className="flex items-end md:items-center justify-center">
          <button
            type="button"
            onClick={swapTokens}
            className="inline-flex items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-200 hover:border-indigo-500 hover:text-indigo-300 transition"
            title="Invertir tokens A/B"
            disabled={!tokenA || !tokenB}
          >
            {/* Swap icon */}
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M7 7h11M7 7l3-3M7 7l3 3" />
              <path d="M17 17H6M17 17l-3-3M17 17l-3 3" />
            </svg>
            Swap
          </button>
        </div>

        {/* Token B */}
        <div className="space-y-2">
          <label className="text-sm text-zinc-400">
            {labelNameB} (solicitas){labelSuffixB ? ` — ${labelSuffixB}` : ""}
          </label>
          <select
            className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500 focus:ring-2 ring-indigo-500/30 transition"
            value={tokenB}
            onChange={(e) => setTokenB(e.target.value)}
          >
            {tokens
              .filter((t) => t.toLowerCase() !== tokenA.toLowerCase())
              .map((t) => (
                <option key={t} value={t}>
                  {truncate(t)}
                </option>
              ))}
          </select>
          <input
            className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 outline-none focus:border-indigo-500 focus:ring-2 ring-indigo-500/30 transition"
            type="number"
            min="0"
            step="any"
            value={amountB}
            onChange={(e) => setAmountB(e.target.value)}
            placeholder="Monto B"
          />
        </div>
      </div>

      {/* Pair preview */}
      {tokenA && tokenB && (
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-3">
          <div className="text-xs text-zinc-400">Par seleccionado</div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/70 px-3 py-1 font-mono">
              {(tokenInfoA?.symbol || tokenInfoA?.name) ?? truncate(tokenA, 6, 6)}
            </span>
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4 text-zinc-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
            <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-800/70 px-3 py-1 font-mono">
              {(tokenInfoB?.symbol || tokenInfoB?.name) ?? truncate(tokenB, 6, 6)}
            </span>
          </div>
        </div>
      )}

      {/* Duration */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm text-zinc-400">Duración (segundos) — min 3600</label>
          <span className="text-xs text-zinc-400">{secondsToHuman(duration)}</span>
        </div>
        <input
          className="w-full rounded-md bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-indigo-500 focus:ring-2 ring-indigo-500/30 transition"
          type="number"
          min={3600}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
        />
        <input
          type="range"
          min={3600}
          max={7 * 24 * 3600}
          step={3600}
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="w-full accent-indigo-500"
        />
      </div>

      {/* Validation hints */}
      <div className="space-y-1 text-xs">
        {!account && (
          <p className="text-yellow-300">
            Conecta tu wallet para crear operaciones.
          </p>
        )}
        {!tokensValid && tokenA && tokenB && (
          <p className="text-red-400">
            Los tokens deben ser distintos.
          </p>
        )}
        {!amountsValid && (amountA !== "0" || amountB !== "0") && (
          <p className="text-red-400">Ingresa montos mayores a cero.</p>
        )}
        {!durationValid && (
          <p className="text-red-400">La duración mínima es 3600 segundos.</p>
        )}
      </div>

      {/* Submit */}
      <button
        onClick={onCreate}
        disabled={!canCreate}
        className={`w-full inline-flex items-center justify-center rounded-md px-4 py-3 text-sm font-semibold transition ${
          canCreate
            ? "bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 text-white hover:opacity-90"
            : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
        }`}
      >
        {submitting ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-white/60 border-t-transparent animate-spin" />
            Creando operación…
          </span>
        ) : (
          "Crear operación"
        )}
      </button>
    </div>
  );
}
