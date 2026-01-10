
// src/lib/contracts.ts
import { BrowserProvider, Contract, JsonRpcSigner } from "ethers";
import TokenSwapAbi from "./TokenSwap.abi.json";
import MockERC20Abi from "./MockERC20.abi.json";

// Fallback a constantes si no hay envs:
export const TOKEN_SWAP_ADDRESS =
  process.env.NEXT_PUBLIC_SWAP_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";

export const TOKENS = {
  TKA: process.env.NEXT_PUBLIC_TOKEN_A || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  TKB: process.env.NEXT_PUBLIC_TOKEN_B || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  TKC: process.env.NEXT_PUBLIC_TOKEN_C || "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  TKD: process.env.NEXT_PUBLIC_TOKEN_D || "0x3Aa5ebB10DC797CAC828524e59A333d0A371443c"
};

export const getTokenSwap = (provOrSigner: BrowserProvider | JsonRpcSigner) =>
  new Contract(TOKEN_SWAP_ADDRESS, TokenSwapAbi as any, provOrSigner);

export const getErc20 = (address: string, provOrSigner: BrowserProvider | JsonRpcSigner) =>
  new Contract(address, MockERC20Abi as any, provOrSigner);
