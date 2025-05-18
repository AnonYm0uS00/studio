
'use client';

import type { ModelNode } from './types';
import { ChevronRight, ChevronDown, Eye, EyeOff } from 'lucide-react';
import React, { useState } from 'react';
import { Button } from "@/components/ui/button"; // Added for icon button

interface HierarchyNodeViewProps {
  node: ModelNode;
  defaultOpen?: boolean;
  hiddenMeshIds: Set<string>;
  onToggleVisibility: (meshId: string) => void;
  level?: number; // Optional: for indentation or styling based on depth
}

export const ModelHierarchyView: React.FC<HierarchyNodeViewProps> = ({ node, defaultOpen = false, hiddenMeshIds, onToggleVisibility, level = 0 }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const hasChildren = node.children && node.children.length > 0;

  const handleAccordionToggle = (event: React.MouseEvent) => {
    // Only toggle accordion if the click wasn't on the visibility button
    if (event.target === event.currentTarget || (event.target as HTMLElement).closest('[data-visibility-toggle]') === null) {
      if (hasChildren) {
        setIsOpen(!isOpen);
      }
    }
  };

  const handleVisibilityClick = (event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent accordion from toggling
    onToggleVisibility(node.id);
  };

  const isMesh = node.type === 'Mesh' || node.type === 'InstancedMesh' || node.type === 'AbstractMesh'; // Include AbstractMesh as some loaders might use it
  const isCurrentlyVisible = !hiddenMeshIds.has(node.id);

  return (
    <li className="ml-2 list-none">
      <div 
        className={`flex items-center py-1 cursor-pointer hover:bg-muted/50 rounded-sm ${hasChildren ? '' : 'ml-[22px]'}`} 
        onClick={handleAccordionToggle}
        role={hasChildren ? "button" : undefined}
        aria-expanded={hasChildren ? isOpen : undefined}
      >
        {hasChildren && (
          isOpen ? <ChevronDown className="h-4 w-4 mr-1 flex-shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mr-1 flex-shrink-0 text-muted-foreground" />
        )}
        
        {isMesh && (
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 mr-1 p-0 data-[visibility-toggle]" // Added data attribute
            onClick={handleVisibilityClick}
            title={isCurrentlyVisible ? "Hide Mesh" : "Show Mesh"}
          >
            {isCurrentlyVisible ? <Eye className="h-3.5 w-3.5 text-accent-foreground" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
          </Button>
        )}
        {!isMesh && hasChildren && <div className="w-5 mr-1 flex-shrink-0" /> /* Placeholder for alignment if not mesh but has children */}


        <span className="text-sm text-foreground truncate" title={node.name}>
          {node.name}
        </span>
        <span className="text-xs text-muted-foreground ml-2">({node.type})</span>
      </div>
      {isOpen && hasChildren && (
        <ul className="pl-4 border-l border-border ml-[7px]"> {/* Indentation for children */}
          {node.children.map((child) => (
            <ModelHierarchyView 
              key={child.id} 
              node={child} 
              defaultOpen={false} 
              hiddenMeshIds={hiddenMeshIds}
              onToggleVisibility={onToggleVisibility}
              level={level + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
};
