import React, { useEffect, useRef, useState } from 'react';
import { CrawlerLog } from '../types';

interface TerminalLogProps {
  logs: CrawlerLog[];
  active: boolean;
}

export const TerminalLog: React.FC<TerminalLogProps> = ({ logs, active }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="w-full max-w-2xl bg-[#1a1a1a] rounded-2xl p-6 font-mono text-xs md:text-sm h-72 overflow-hidden flex flex-col relative shadow-2xl shadow-black/20">
      <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
            <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
        </div>
        <span className="text-gray-500 text-[10px] uppercase tracking-widest font-semibold">Live Crawler</span>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-2 custom-scrollbar">
        {logs.length === 0 && active && (
             <div className="text-gray-500 italic">Initializing crawler agents...</div>
        )}
        {logs.map((log, i) => (
          <div key={i} className="flex gap-4 font-mono items-center">
            <span className="text-gray-600 shrink-0 text-[10px] w-16">[{new Date(log.time).toLocaleTimeString([], {hour12: false, minute:'2-digit', second:'2-digit'})}]</span>
            <span className={log.status === 200 ? 'text-green-500 shrink-0 w-8' : 'text-red-500 shrink-0 w-8'}>
              {log.status}
            </span>
            <span className="text-gray-300 truncate font-light tracking-tight">{log.url}</span>
          </div>
        ))}
        {active && (
          <div className="animate-pulse text-green-500 mt-2 flex items-center gap-2">
            <span>&gt;</span>
            <span className="text-gray-400">Processing stream...</span>
          </div>
        )}
      </div>
    </div>
  );
};