
// src/lib/ethereum.tsx
"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Eip1193Provider, JsonRpcSigner } from "ethers";

type Web3ContextType = {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  account: string | null;
  chainId: number | null;
  connect: () => Promise<void>;
  disconnect: () => void; // soft-disconnect (solo UI)
};

const Web3Context = createContext<Web3ContextType>({
  provider: null,
  signer: null,
  account: null,
  chainId: null,
  connect: async () => {},
  disconnect: () => {},
});

export const Web3Provider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  const connect = async () => {
    if (!window.ethereum) {
      alert("MetaMask no detectado");
      return;
    }
    const prov = new BrowserProvider(window.ethereum as Eip1193Provider);
    await prov.send("eth_requestAccounts", []);
    const s = await prov.getSigner();
    const net = await prov.getNetwork();

    setProvider(prov);
    setSigner(s);
    setAccount((await s.getAddress()).toLowerCase());
    setChainId(Number(net.chainId));
  };

  const disconnect = () => {
    setSigner(null);
    setAccount(null);
    // No hay método estandar para “desconectar” MetaMask, esto es un soft reset de UI.
  };

  // Efectos para cambios de cuenta/red
  useEffect(() => {
    const eth = (window as any).ethereum as Eip1193Provider | undefined;
    if (!eth) return;

    const handleAccountsChanged = (accs: string[]) => {
      setAccount(accs?.[0]?.toLowerCase() ?? null);
      // re-creamos signer si ya hay provider
      if (provider && accs?.[0]) {
        provider.getSigner().then(setSigner);
      }
    };
    const handleChainChanged = (_chainIdHex: string) => {
      const n = parseInt(_chainIdHex, 16);
      setChainId(n);
      // reset signer
      if (provider) {
        provider.getSigner().then(setSigner);
      }
    };

    (eth as any).on?.("accountsChanged", handleAccountsChanged);
    (eth as any).on?.("chainChanged", handleChainChanged);

    return () => {
      (eth as any).removeListener?.("accountsChanged", handleAccountsChanged);
      (eth as any).removeListener?.("chainChanged", handleChainChanged);
    };
  }, [provider]);

  const value = useMemo(
    () => ({ provider, signer, account, chainId, connect, disconnect }),
    [provider, signer, account, chainId]
  );

  return <Web3Context.Provider value={value}>{children}</Web3Context.Provider>;
};

export const useWeb3 = () => useContext(Web3Context);

// Para TypeScript
declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}
