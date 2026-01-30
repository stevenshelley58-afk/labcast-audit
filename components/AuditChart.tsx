import React from 'react';
import { RadialBarChart, RadialBar, ResponsiveContainer, PolarAngleAxis } from 'recharts';

interface AuditChartProps {
  score: number;
  label: string;
  color: string;
}

export const AuditChart: React.FC<AuditChartProps> = ({ score, label, color }) => {
  const data = [{ name: label, value: score, fill: color }];

  return (
    <div className="flex flex-col items-center justify-center p-8 w-full h-full">
      <div className="h-32 w-32 relative">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart 
            innerRadius="75%" 
            outerRadius="100%" 
            barSize={10} 
            data={data} 
            startAngle={90} 
            endAngle={-270}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar
              background={{ fill: '#f3f4f6' }} 
              dataKey="value"
              cornerRadius={10}
            />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center flex-col">
          <span className="text-4xl font-bold text-black tracking-tighter">{score}</span>
        </div>
      </div>
      <h3 className="mt-6 text-xs font-bold text-gray-400 uppercase tracking-widest">{label}</h3>
    </div>
  );
};