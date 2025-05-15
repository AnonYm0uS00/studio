
'use client';

import type { ModelNode } from './types';
import { ChevronRight, ChevronDown } from 'lucide-react';
import React, { useState } from 'react';

interface HierarchyNodeViewProps {
  node: ModelNode;
  defaultOpen?: boolean;
}

export const ModelHierarchyView: React.FC<HierarchyNodeViewProps> = ({ node, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const hasChildren = node.children && node.children.length > 0;

  const handleToggle = () => {
    if (hasChildren) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <li className="ml-2 list-none">
      <div 
        className={`flex items-center py-1 cursor-pointer hover:bg-muted/50 rounded-sm ${hasChildren ? '' : 'ml-[22px]'}`} 
        onClick={handleToggle}
        role={hasChildren ? "button" : undefined}
        aria-expanded={hasChildren ? isOpen : undefined}
      >
        {hasChildren && (
          isOpen ? <ChevronDown className="h-4 w-4 mr-1 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 mr-1 flex-shrink-0" />
        )}
        <span className="text-sm text-foreground truncate" title={node.name}>
          {node.name}
        </span>
        <span className="text-xs text-muted-foreground ml-2">({node.type})</span>
      </div>
      {isOpen && hasChildren && (
        <ul className="pl-4 border-l border-border ml-[7px]">
          {node.children.map((child) => (
            <ModelHierarchyView key={child.id} node={child} defaultOpen={false} />
          ))}
        </ul>
      )}
    </li>
  );
};
