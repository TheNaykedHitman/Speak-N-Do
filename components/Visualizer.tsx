import React from 'react';

interface VisualizerProps {
  isActive: boolean;
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive }) => {
  return (
    <div className="flex items-center justify-center h-16 w-full space-x-1">
      {[...Array(24)].map((_, i) => (
        <div
          key={i}
          className={`w-0.5 rounded-full transition-all duration-100 ${
            isActive ? 'bg-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.8)]' : 'bg-white/5'
          }`}
          style={{
            height: isActive ? `${20 + Math.random() * 80}%` : '4px',
            transitionDelay: `${i * 10}ms`,
            opacity: isActive ? 1 - (Math.abs(12 - i) / 15) : 0.1
          }}
        />
      ))}
    </div>
  );
};

export default Visualizer;