
// src/components/ConnectWallet.tsx
"use client";

import { useState } from "react";
import { useWeb3 } from "@/src/lib/ethereum";

const ANVIL_CHAIN_ID = process.env.NEXT_PUBLIC_CHAIN_ID || 31337;
const ANVIL_CHAIN_HEX = "0x7a69"; // 31337 en hex
const ANVIL_RPC = process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:8545";

export default function ConnectWallet() {
  const { account, chainId, connect, disconnect } = useWeb3();
  const [copying, setCopying] = useState(false);
  const mismatch = chainId !== null && chainId !== ANVIL_CHAIN_ID;

  const copyAddr = async () => {
    if (!account) return;
    try {
      await navigator.clipboard.writeText(account);
      setCopying(true);
      setTimeout(() => setCopying(false), 800);
    } catch {}
  };

  const switchToAnvil = async () => {
    const eth = (window as any).ethereum;
    if (!eth) return alert("MetaMask no detectado");
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ANVIL_CHAIN_HEX }],
      });
    } catch (err: any) {
      // Si la red no existe, código 4902 → la agregamos
      if (err?.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: ANVIL_CHAIN_HEX,
              chainName: "Anvil (31337)",
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
              rpcUrls: [ANVIL_RPC],
              blockExplorerUrls: [],
            },
          ],
        });
      } else {
        console.error("wallet_switchEthereumChain error:", err);
        alert("No se pudo cambiar de red. Revisa la consola.");
      }
    }
  };

  if (!account) {
    return (
      <button
        onClick={connect}
        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" className="opacity-90"><path fill="currentColor" d="M7 10h10v4H7z"/><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10s10-4.5 10-10S17.5 2 12 2m5 13H7v-4h10z"/></svg>
        Conectar
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3">
      {/* Chain badge */}
      <div
        className={`px-2 py-1 rounded-md text-xs border ${
          mismatch
            ? "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-200 dark:border-yellow-800"
            : "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-200 dark:border-green-800"
        }`}
        title={`ChainId actual: ${chainId ?? "?"}`}
      >
        {mismatch ? "Wrong network" : "Anvil · 31337"}
      </div>

      {mismatch && (
        <button
          className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium bg-yellow-600 text-white hover:bg-yellow-700"
          onClick={switchToAnvil}
        >
          Cambiar a Anvil
        </button>
      )}

      {/* Account pill */}
      <div className="flex items-center gap-2 rounded-md border px-2.5 py-1.5 bg-white/60 dark:bg-zinc-950/40">
        <span className="text-xs text-zinc-500">Cuenta</span>
        <span className="font-mono text-sm">
          {account.slice(0, 6)}…{account.slice(-4)}
        </span>
        <button
          onClick={copyAddr}
          className="text-xs px-1.5 py-0.5 rounded border hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Copiar"
        >
          {copying ? "✓ Copiado" : "Copiar"}
        </button>
        <button
          onClick={disconnect}
          className="text-xs px-1.5 py-0.5 rounded border hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Desconectar (UI)"
        >
          Salir
        </button>
      </div>
    </div>
  );
}
