
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => {
  return (
    <div className={`bg-white/60 backdrop-blur-xl rounded-2xl shadow-lg border border-white/30 p-6 md:p-8 transition-all duration-300 ${className}`}>
      {children}
    </div>
  );
};

export default Card;