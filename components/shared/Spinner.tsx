
import React from 'react';

const Spinner: React.FC<{ size?: 'sm' | 'md' | 'lg'}> = ({ size = 'md' }) => {
  const sizeClasses = {
    sm: 'h-6 w-6 border-2',
    md: 'h-12 w-12 border-b-4',
    lg: 'h-16 w-16 border-b-4'
  }
  return (
    <div className="flex justify-center items-center">
      <div className={`animate-spin rounded-full border-primary ${sizeClasses[size]}`} style={{borderColor: '#588157', borderBottomColor: 'transparent'}}></div>
    </div>
  );
};

export default Spinner;