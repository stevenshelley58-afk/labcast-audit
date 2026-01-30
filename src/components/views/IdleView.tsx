import React, { useState } from 'react';
import { Globe, ArrowRight, CheckCircle2 } from 'lucide-react';

interface IdleViewProps {
  onSubmit: (url: string) => void;
}

export function IdleView({ onSubmit }: IdleViewProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url) {
      onSubmit(url);
    }
  };

  return (
    <div className="animate-fade-in-up w-full max-w-3xl mx-auto text-center">
      <h2 className="text-5xl md:text-7xl font-semibold tracking-tighter leading-[1.05] mb-8 text-black">
        Audit your website.<br/>
        <span className="text-gray-400">Instantly.</span>
      </h2>
      <p className="text-xl text-gray-500 mb-12 leading-relaxed max-w-2xl mx-auto">
        Full-spectrum SEO, Technical, and Design analysis powered by Gemini.
        Enter a URL to begin the crawl.
      </p>

      <form onSubmit={handleSubmit} className="relative max-w-xl mx-auto group">
        <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
          <Globe className="h-6 w-6 text-gray-400 group-focus-within:text-black transition-colors" />
        </div>
        <input
          type="url"
          required
          placeholder="https://example.com"
          className="w-full bg-white border border-gray-200 rounded-full py-6 pl-16 pr-36 text-lg focus:outline-none focus:ring-4 focus:ring-black/5 focus:border-black transition-all shadow-xl shadow-black/5 placeholder-gray-300"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button
          type="submit"
          className="absolute right-2 top-2 bottom-2 bg-black text-white font-medium text-base px-8 rounded-full hover:bg-gray-800 transition-all flex items-center gap-2 group/btn"
        >
          Audit
          <ArrowRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />
        </button>
      </form>

      <div className="mt-12 flex items-center justify-center gap-8 text-xs font-mono text-gray-400 uppercase tracking-widest">
        <span className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-green-500" />
          Technical SEO
        </span>
        <span className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-green-500" />
          Design Fidelity
        </span>
        <span className="flex items-center gap-2">
          <CheckCircle2 size={14} className="text-green-500" />
          CRO Analysis
        </span>
      </div>
    </div>
  );
}
