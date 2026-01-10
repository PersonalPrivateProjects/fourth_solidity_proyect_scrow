
// src/app/page.tsx
"use client";

import ConnectWallet from "../components/ConnectWallet";
import CreateOperations from "../components/CreateOperations";
import OperationList from "../components/OperationList";
import BalanceDebug from "../components/BalanceDebug";
import AddTokens from "../components/Addtokens";
import { Web3Provider } from "../lib/ethereum";

export default function Page() {
  return (
  
        <div className="min-h-screen bg-neutral-900 text-neutral-100">           
        
          <header className="sticky top-0 z-40 w-full backdrop-blur bg-white/70 dark:bg-zinc-900/60 border-b border-zinc-200/60 dark:border-zinc-800">
               <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
                 {/* Brand */}
                 <div className="flex items-center gap-3">
                   <div className="h-8 w-8 rounded-md bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500" />
                   <div className="flex flex-col leading-tight">
                     <span className="font-semibold">TokenSwap</span>
                     <span className="text-xs text-zinc-500">DApp · Escrow de swaps ERC-20</span>
                   </div>
                   <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full border bg-white/50 dark:bg-zinc-950/50">
                     beta
                   </span>
                 </div>
          
                 {/* Right */}
                 <div className="flex items-center gap-3">
                   <ConnectWallet />
                 </div>
               </div>
          </header>

          <main className="max-w-6xl mx-auto p-6 space-y-6">
          
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <AddTokens />
                    <CreateOperations />
                  </div>
          
                  <OperationList />
          
                  <BalanceDebug />
               
          </main>
     
    </div>
  );
}
