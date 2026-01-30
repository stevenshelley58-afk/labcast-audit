import React, { useState } from 'react';
import { AuditReport, AuditFinding } from '../types';
import { AuditChart } from './AuditChart';
import { CheckCircle, AlertTriangle, XCircle, ArrowRight, Download, Layers, Cpu, Palette, MousePointer, ExternalLink, MapPin } from 'lucide-react';

interface ResultsDashboardProps {
  report: AuditReport;
}

const SeverityIcon = ({ impact }: { impact: string }) => {
  switch (impact) {
    case 'High': return <XCircle className="text-red-500 w-5 h-5" />;
    case 'Medium': return <AlertTriangle className="text-amber-500 w-5 h-5" />;
    case 'Low': return <CheckCircle className="text-blue-500 w-5 h-5" />;
    default: return <CheckCircle className="text-gray-400 w-5 h-5" />;
  }
};

const CategoryIcon = ({ category }: { category: string }) => {
    switch (category) {
        case 'seo': return <Layers size={14} />;
        case 'technical': return <Cpu size={14} />;
        case 'design': return <Palette size={14} />;
        case 'conversion': return <MousePointer size={14} />;
        default: return <Layers size={14} />;
    }
}

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ report }) => {
  const [filter, setFilter] = useState<string>('all');

  const categories = ['all', 'seo', 'technical', 'design', 'conversion', 'content'];

  const filteredFindings = report.findings.filter(f => 
    filter === 'all' ? true : f.category === filter
  ).sort((a, b) => a.priority - b.priority);

  const getCategoryCount = (cat: string) => {
    return report.findings.filter(f => f.category === cat).length;
  };

  const handleDownload = () => {
    const lines = [
      `# AUDIT REPORT`,
      `Target: ${report.url}`,
      `Date: ${new Date(report.generatedAt).toLocaleString()}`,
      `Overall Score: ${report.overallScore}/100`,
      `\n## EXECUTIVE SUMMARY`,
      report.summary,
      `\n## DESIGN INTELLIGENCE`,
      `Aesthetic Score: ${report.designAnalysis.aestheticScore}/100`,
      `Price Point Alignment: ${report.designAnalysis.pricePointMatch}`,
      `Critique: ${report.designAnalysis.critique}`,
      `\n## FINDINGS LOG`,
      ...report.findings.map(f => `
[${f.impact.toUpperCase()}] ${f.title} (${f.category.toUpperCase()})
Priority: ${f.priority}
Location: ${f.visualLocation || 'General'}
URL: ${f.referenceUrl || report.url}
Issue: ${f.description}
Fix: ${f.fix}
----------------------------------------`)
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-report-${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
           <AuditChart score={report.overallScore} label="Health Score" color="#111111" />
        </div>
        <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
           <AuditChart score={report.designAnalysis.aestheticScore} label="Design Index" color="#10b981" />
        </div>
        
        <div className="md:col-span-2 bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-black animate-pulse"></span>
                <h3 className="text-gray-400 font-mono text-xs tracking-wider uppercase">Executive Summary</h3>
            </div>
            <p className="text-gray-800 text-sm leading-relaxed mb-6 font-medium">{report.summary}</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-t border-gray-100 pt-4">
             <div>
                <span className="text-xs text-gray-400 font-mono block mb-1">BRAND PERCEPTION</span>
                <span className={`font-semibold px-4 py-1.5 rounded-full text-sm border ${
                    report.designAnalysis.pricePointMatch.toLowerCase().includes('cheap') || report.designAnalysis.pricePointMatch.toLowerCase().includes('budget')
                    ? 'bg-red-50 text-red-600 border-red-100'
                    : 'bg-gray-100 text-black border-gray-200'
                }`}>
                    {report.designAnalysis.pricePointMatch}
                </span>
             </div>
             <div className="flex gap-2">
                <button 
                    onClick={handleDownload}
                    className="flex items-center gap-2 bg-black hover:bg-gray-800 text-white px-5 py-2.5 rounded-full transition-colors text-sm font-medium"
                >
                    <Download size={16} />
                    Export
                </button>
             </div>
          </div>
        </div>
      </div>

      {/* Design Analysis Feature Box */}
      <div className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm relative overflow-hidden group">
         <div className="absolute top-0 right-0 p-40 bg-gradient-to-br from-gray-50 to-gray-100 rounded-full -mr-20 -mt-20 pointer-events-none group-hover:scale-110 transition-transform duration-700"></div>
         <h3 className="text-xl font-bold text-black mb-3 flex items-center gap-2 relative z-10">
            <Palette size={20} className="text-black" />
            Visual & Brand Analysis
         </h3>
         <p className="text-gray-600 text-base leading-relaxed relative z-10 max-w-4xl">{report.designAnalysis.critique}</p>
      </div>

      {/* Findings Section */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-gray-100 overflow-x-auto scrollbar-hide p-2 bg-gray-50/50">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-6 py-3 text-sm font-medium rounded-full transition-all whitespace-nowrap flex items-center gap-2 mx-1 ${
                filter === cat 
                  ? 'bg-black text-white shadow-md' 
                  : 'text-gray-500 hover:bg-gray-200/50 hover:text-black'
              }`}
            >
              {cat !== 'all' && <CategoryIcon category={cat} />}
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
              <span className={`ml-1 text-xs py-0.5 px-2 rounded-full ${filter === cat ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-600'}`}>
                {cat === 'all' ? report.findings.length : getCategoryCount(cat)}
              </span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="divide-y divide-gray-100">
          {filteredFindings.length === 0 ? (
            <div className="p-20 text-center">
              <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle size={40} />
              </div>
              <p className="text-gray-900 font-bold text-lg">No issues found.</p>
              <p className="text-gray-500 mt-1">Great job! This section is clean.</p>
            </div>
          ) : (
            filteredFindings.map((finding) => (
              <div key={finding.id} className="p-8 hover:bg-gray-50/50 transition-colors group">
                <div className="flex items-start gap-6">
                  <div className="mt-1 flex-shrink-0 p-2 bg-gray-50 rounded-xl">
                    <SeverityIcon impact={finding.impact} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <h4 className="text-black font-bold text-lg">{finding.title}</h4>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] uppercase px-3 py-1 rounded-full font-bold tracking-wide border ${
                            finding.impact === 'High' ? 'border-red-100 text-red-600 bg-red-50' :
                            finding.impact === 'Medium' ? 'border-amber-100 text-amber-600 bg-amber-50' :
                            'border-blue-100 text-blue-600 bg-blue-50'
                        }`}>
                            {finding.impact}
                        </span>
                        <span className="text-[10px] uppercase text-gray-400 font-mono border border-gray-200 px-2 py-1 rounded-full">
                            P{finding.priority}
                        </span>
                      </div>
                    </div>
                    
                    {/* Location Badge */}
                    <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-gray-500">
                        {finding.visualLocation && (
                            <div className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-md">
                                <MapPin size={12} />
                                <span className="font-medium">{finding.visualLocation}</span>
                            </div>
                        )}
                         {finding.referenceUrl && (
                            <a href={finding.referenceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-black transition-colors">
                                <ExternalLink size={12} />
                                <span className="truncate max-w-[200px]">{finding.referenceUrl}</span>
                            </a>
                        )}
                    </div>

                    <p className="text-gray-600 text-sm mb-5 leading-relaxed max-w-4xl">{finding.description}</p>
                    
                    <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 flex gap-4">
                      <div className="flex-shrink-0 mt-0.5">
                        <ArrowRight size={16} className="text-black" />
                      </div>
                      <div className="flex-1">
                          <span className="text-black text-xs font-bold uppercase tracking-wider block mb-1">Recommendation</span>
                          <p className="text-gray-700 text-sm font-medium">{finding.fix}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}