
// src/lib/useMockERC.ts
"use client";

import { useCallback } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "@/src/lib/ethereum";
import MockERC20Abi from "@/src/lib/MockERC20.abi.json";
import MockERC20BytecodeJson from "@/src/lib/MockERC20.bytecode.json";

export const useMockERC = () => {
  const { signer } = useWeb3();
  
  // Asegura obtener el string
  const BYTECODE: string = (MockERC20BytecodeJson as { bytecode: string }).bytecode;
  
  // Guard de robustez: debe ser un hex válido
  if (!BYTECODE || !BYTECODE.startsWith("0x")) {
    throw new Error("Bytecode inválido: se esperaba un string '0x...'");
  }

  // Deploy restringido por owner
  const deployMockERC20 = useCallback(
    async (name: string, symbol: string, requiredOwner?: string): Promise<string> => {
      if (!signer) throw new Error("Conecta la wallet");
      if (!name?.trim() || !symbol?.trim()) throw new Error("name/symbol requeridos");

      // Si se pasa requiredOwner, validamos la cuenta conectada
      if (requiredOwner) {
        const addr = (await signer.getAddress()).toLowerCase();
        if (addr !== requiredOwner.toLowerCase()) {
          throw new Error("No autorizado: solo el owner del TokenSwap puede crear tokens");
        }
      }

      const factory = new ethers.ContractFactory(
        MockERC20Abi as any,
        BYTECODE as string,
        signer
      );
      const contract = await factory.deploy(name.trim(), symbol.trim());
      await contract.waitForDeployment();
      return await contract.getAddress();
    },
    [signer]
  );

  // ... (mintMockERC20 y getTokenInfo iguales que antes)
  return { deployMockERC20 /*, mintMockERC20, getTokenInfo */ };
};
