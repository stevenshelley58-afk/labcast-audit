import React, { useState } from 'react';
import { Globe, ArrowRight, CheckCircle2 } from 'lucide-react';

interface IdleViewProps {
  onSubmit: (url: string) => void;
}

/**
 * Fuzzy URL normalizer - accepts almost anything and tries to make a valid URL
 */
function normalizeInput(input: string): string {
  let url = input.trim();

  // Remove common garbage
  url = url.replace(/^[<>"']+|[<>"']+$/g, ''); // Remove quotes/brackets
  url = url.replace(/\s+/g, ''); // Remove all whitespace

  // Handle pasted text with "http" buried in it
  const httpMatch = url.match(/(https?:\/\/[^\s<>"']+)/i);
  if (httpMatch) {
    url = httpMatch[1];
  }

  // Remove protocol prefixes if duplicated (e.g., "https://https://")
  url = url.replace(/^(https?:\/\/)+/i, '');

  // Handle common typos
  url = url.replace(/^(htt[ps]?[;:]?\/?\/?)(?!\/)/i, ''); // Remove broken protocol
  url = url.replace(/^:\/\//, ''); // Remove orphan "://"
  url = url.replace(/^\/+/, ''); // Remove leading slashes

  // If it looks like a domain or has dots, treat as URL
  if (url.length > 0) {
    // Add .com if no TLD and no dots (e.g., "google" -> "google.com")
    if (!url.includes('.') && !url.includes('/') && !url.includes(':')) {
      url = url + '.com';
    }

    // Always prepend https://
    url = 'https://' + url;
  }

  return url;
}

export function IdleView({ onSubmit }: IdleViewProps) {
  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      const normalized = normalizeInput(url);
      onSubmit(normalized);
    }
  };

  return (
    <div className="animate-fade-in-up w-full max-w-3xl mx-auto text-center">
      <h2 className="text-5xl md:text-7xl font-semibold tracking-tighter leading-[1.05] mb-8 text-black">
        Audit your website.<br/>
        <span className="text-gray-400">Instantly.</span>
      </h2>
      <p className="text-xl text-gray-500 mb-12 leading-relaxed max-w-2xl mx-auto">
        SEO, technical, and design analysis in one scan. Enter a URL to get started.
      </p>

      <form onSubmit={handleSubmit} className="max-w-xl mx-auto">
        {/* Homepage URL input */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
            <Globe className="h-6 w-6 text-gray-400 group-focus-within:text-black transition-colors" />
          </div>
          <input
            type="text"
            placeholder="example.com"
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
        </div>
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
