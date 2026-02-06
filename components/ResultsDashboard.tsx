import React, { useState } from 'react';
import { AuditReport, AuditFinding } from '../types';
import { AuditChart } from './AuditChart';
import {
  CheckCircle, AlertTriangle, XCircle, ArrowRight, Download,
  ChevronDown, ChevronUp, Palette, Zap, Search, Shield,
  Share2, Wrench, FileText, Eye, Globe
} from 'lucide-react';

interface ResultsDashboardProps {
  report: AuditReport;
}

// ============================================================================
// SECTION CONFIGURATION
// ============================================================================

interface SectionConfig {
  id: string;
  title: string;
  icon: React.ReactNode;
  categories: string[]; // which finding categories map to this section
  color: string;
}

const SECTIONS: SectionConfig[] = [
  {
    id: 'design',
    title: 'Design & UX',
    icon: <Palette size={18} />,
    categories: ['design'],
    color: '#8b5cf6',
  },
  {
    id: 'performance',
    title: 'Performance & Speed',
    icon: <Zap size={18} />,
    categories: ['technical'],
    color: '#f59e0b',
  },
  {
    id: 'seo',
    title: 'SEO & Keywords',
    icon: <Search size={18} />,
    categories: ['seo'],
    color: '#3b82f6',
  },
  {
    id: 'security',
    title: 'Security & Trust',
    icon: <Shield size={18} />,
    categories: ['security'],
    color: '#10b981',
  },
  {
    id: 'content',
    title: 'Content & Conversion',
    icon: <FileText size={18} />,
    categories: ['content', 'conversion'],
    color: '#ec4899',
  },
];

// ============================================================================
// HELPERS
// ============================================================================

function getSectionRating(findings: AuditFinding[]): 'Good' | 'Needs Work' | 'Critical' {
  const highCount = findings.filter(f => f.impact === 'High').length;
  const medCount = findings.filter(f => f.impact === 'Medium').length;
  if (highCount >= 2) return 'Critical';
  if (highCount >= 1 || medCount >= 3) return 'Needs Work';
  return 'Good';
}

function getRatingStyles(rating: 'Good' | 'Needs Work' | 'Critical') {
  switch (rating) {
    case 'Critical':
      return { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-100', dot: 'bg-red-500' };
    case 'Needs Work':
      return { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', dot: 'bg-amber-500' };
    case 'Good':
      return { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-100', dot: 'bg-green-500' };
  }
}

function generateSectionSummary(sectionId: string, findings: AuditFinding[], report: AuditReport): string {
  const highCount = findings.filter(f => f.impact === 'High').length;
  const medCount = findings.filter(f => f.impact === 'Medium').length;
  const total = findings.length;

  if (total === 0) return 'No issues detected in this area. Everything looks good.';

  switch (sectionId) {
    case 'design':
      return report.designAnalysis.critique || `Found ${total} design-related observations. ${highCount > 0 ? `${highCount} need urgent attention.` : 'Most are minor improvements.'}`;
    case 'performance':
      if (highCount >= 2) return `Your site has ${highCount} critical speed issues that are likely costing you visitors. Slow sites lose more than half their traffic.`;
      if (highCount >= 1) return `There's a significant speed issue that needs addressing, along with ${medCount} smaller optimisations.`;
      return `Performance is generally acceptable with ${total} minor improvements available.`;
    case 'seo':
      if (highCount >= 2) return `${highCount} critical SEO issues are limiting your visibility in search results. These need immediate attention.`;
      if (highCount >= 1) return `One major SEO issue found alongside ${medCount} optimisations that could improve your rankings.`;
      return `SEO fundamentals are in place with ${total} areas for improvement.`;
    case 'security':
      if (highCount >= 1) return `${highCount} security concern${highCount > 1 ? 's' : ''} found that could affect visitor trust and browser warnings.`;
      return total > 0 ? `${total} minor security hardening recommendation${total > 1 ? 's' : ''} to improve trust signals.` : 'Security fundamentals are solid.';
    case 'content':
      if (highCount >= 1) return `${highCount} content or conversion issue${highCount > 1 ? 's' : ''} may be preventing visitors from taking action.`;
      return `${total} content improvement${total > 1 ? 's' : ''} that could help convert more visitors.`;
    default:
      return `${total} finding${total > 1 ? 's' : ''} in this area.`;
  }
}

// ============================================================================
// COMPONENTS
// ============================================================================

const ImpactBadge = ({ impact }: { impact: string }) => {
  const styles = {
    High: 'border-red-100 text-red-600 bg-red-50',
    Medium: 'border-amber-100 text-amber-600 bg-amber-50',
    Low: 'border-blue-100 text-blue-600 bg-blue-50',
  };
  return (
    <span className={`text-[10px] uppercase px-3 py-1 rounded-full font-bold tracking-wide border ${styles[impact as keyof typeof styles] || styles.Low}`}>
      {impact}
    </span>
  );
};

const SeverityIcon = ({ impact }: { impact: string }) => {
  switch (impact) {
    case 'High': return <XCircle className="text-red-500 w-5 h-5" />;
    case 'Medium': return <AlertTriangle className="text-amber-500 w-5 h-5" />;
    case 'Low': return <CheckCircle className="text-blue-500 w-5 h-5" />;
    default: return <CheckCircle className="text-gray-400 w-5 h-5" />;
  }
};

/** Individual finding row inside an expanded section */
function FindingRow({ finding }: { finding: AuditFinding }) {
  return (
    <div className="p-6 md:p-8 hover:bg-gray-50/50 transition-colors border-t border-gray-100 first:border-t-0">
      <div className="flex items-start gap-4 md:gap-6">
        <div className="mt-1 flex-shrink-0 p-2 bg-gray-50 rounded-xl">
          <SeverityIcon impact={finding.impact} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h4 className="text-black font-bold text-base md:text-lg">{finding.title}</h4>
            <ImpactBadge impact={finding.impact} />
          </div>

          <p className="text-gray-600 text-sm mb-4 leading-relaxed max-w-4xl">{finding.description}</p>

          <div className="bg-gray-50 p-4 md:p-5 rounded-2xl border border-gray-100 flex gap-4">
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
  );
}

/** Collapsible section card — summary visible, detail expandable */
function SectionCard({
  config,
  findings,
  report,
}: {
  config: SectionConfig;
  findings: AuditFinding[];
  report: AuditReport;
}) {
  const [expanded, setExpanded] = useState(false);
  const rating = getSectionRating(findings);
  const ratingStyles = getRatingStyles(rating);
  const summary = generateSectionSummary(config.id, findings, report);

  // Sort findings: High first, then Medium, then Low
  const sortedFindings = [...findings].sort((a, b) => {
    const order = { High: 0, Medium: 1, Low: 2 };
    return (order[a.impact as keyof typeof order] ?? 2) - (order[b.impact as keyof typeof order] ?? 2);
  });

  return (
    <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden transition-all">
      {/* Summary — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-6 md:p-8 flex items-start gap-4 md:gap-6 hover:bg-gray-50/30 transition-colors cursor-pointer"
      >
        {/* Icon */}
        <div
          className="flex-shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center text-white"
          style={{ backgroundColor: config.color }}
        >
          {config.icon}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <h3 className="text-lg md:text-xl font-bold text-black">{config.title}</h3>
            <span className={`text-[11px] uppercase px-3 py-1 rounded-full font-bold tracking-wide border ${ratingStyles.bg} ${ratingStyles.text} ${ratingStyles.border}`}>
              {rating}
            </span>
          </div>
          <p className="text-gray-500 text-sm md:text-base leading-relaxed">{summary}</p>
        </div>

        {/* Expand indicator */}
        <div className="flex-shrink-0 flex items-center gap-2 mt-1">
          {findings.length > 0 && (
            <span className="text-xs text-gray-400 font-medium hidden md:inline">
              {findings.length} finding{findings.length !== 1 ? 's' : ''}
            </span>
          )}
          {findings.length > 0 ? (
            expanded ? (
              <ChevronUp size={20} className="text-gray-400" />
            ) : (
              <ChevronDown size={20} className="text-gray-400" />
            )
          ) : null}
        </div>
      </button>

      {/* Detail — expandable */}
      {expanded && findings.length > 0 && (
        <div className="border-t border-gray-100">
          {sortedFindings.map((finding) => (
            <FindingRow key={finding.id} finding={finding} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Top priority action items */
function TopFixes({ findings }: { findings: AuditFinding[] }) {
  const topFindings = [...findings]
    .sort((a, b) => {
      const impactOrder = { High: 0, Medium: 1, Low: 2 };
      const ai = impactOrder[a.impact as keyof typeof impactOrder] ?? 2;
      const bi = impactOrder[b.impact as keyof typeof impactOrder] ?? 2;
      if (ai !== bi) return ai - bi;
      return a.priority - b.priority;
    })
    .slice(0, 5);

  if (topFindings.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Top Priorities</h4>
      {topFindings.map((f, i) => (
        <div key={f.id} className="flex items-start gap-4">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-black text-white text-xs font-bold flex items-center justify-center">
            {i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-black font-semibold text-sm">{f.title}</span>
              <ImpactBadge impact={f.impact} />
            </div>
            <p className="text-gray-500 text-xs leading-relaxed truncate">{f.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ResultsDashboard: React.FC<ResultsDashboardProps> = ({ report }) => {
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
    a.download = `audit-report-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Group findings by section
  const sectionFindings: Record<string, AuditFinding[]> = {};
  for (const section of SECTIONS) {
    sectionFindings[section.id] = report.findings.filter(f =>
      section.categories.includes(f.category)
    );
  }

  // Count criticals / warnings across all
  const criticalCount = report.findings.filter(f => f.impact === 'High').length;
  const warningCount = report.findings.filter(f => f.impact === 'Medium').length;

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">

      {/* ─── Score + Executive Summary Row ─── */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Score Ring */}
        <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
          <AuditChart score={report.overallScore} label="Health Score" color="#111111" />
        </div>

        {/* Design Index */}
        <div className="bg-white rounded-[32px] shadow-sm border border-gray-100 overflow-hidden">
          <AuditChart score={report.designAnalysis.aestheticScore} label="Design Index" color="#10b981" />
        </div>

        {/* Executive Summary + Top Fixes */}
        <div className="md:col-span-2 bg-white rounded-[32px] p-6 md:p-8 shadow-sm border border-gray-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-black animate-pulse" />
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

      {/* ─── Top 5 Priorities ─── */}
      <div className="bg-white rounded-[32px] p-6 md:p-8 border border-gray-100 shadow-sm">
        <TopFixes findings={report.findings} />
      </div>

      {/* ─── Section Cards (collapsed by default) ─── */}
      <div className="space-y-4">
        {SECTIONS.map(section => (
          <SectionCard
            key={section.id}
            config={section}
            findings={sectionFindings[section.id] || []}
            report={report}
          />
        ))}
      </div>
    </div>
  );
};