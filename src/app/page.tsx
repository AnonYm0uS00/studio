
'use client';
import { useState, useRef, useCallback, useEffect, ChangeEvent } from 'react';
import type { ArcRotateCamera } from '@babylonjs/core';
import { Vector3 } from '@babylonjs/core';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BabylonViewer, type RenderingMode } from '@/components/babylon-viewer';
import { AlertTriangle, IterationCcw, UploadCloud } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { ModelNode } from '@/components/types';
import { ModelHierarchyView } from '@/components/model-hierarchy-view';


export default function Home() {
  const [submittedModelUrl, setSubmittedModelUrl] = useState<string | null>(null);
  const [modelFileExtension, setModelFileExtension] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [currentFps, setCurrentFps] = useState(0);
  const [renderingMode, setRenderingMode] = useState<RenderingMode>('shaded');

  const [modelName, setModelName] = useState<string | null>(null);
  const [modelHierarchy, setModelHierarchy] = useState<ModelNode[] | null>(null);

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
      setModelName(file.name); // Set model name for the details panel
      setModelHierarchy(null); // Reset hierarchy on new file selection

      const nameParts = file.name.split('.');
      const ext = nameParts.length > 1 ? `.${nameParts.pop()?.toLowerCase()}` : '';
      setModelFileExtension(ext);
      
      setError(null);
      setIsLoading(true);
      setSubmittedModelUrl(null); 

      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setSubmittedModelUrl(e.target.result as string);
        } else {
          setError("Failed to read file.");
          setIsLoading(false);
          toast({ title: "Error", description: "Could not read the selected file.", variant: "destructive" });
        }
      };
      reader.onerror = () => {
        setError("Error reading file.");
        setIsLoading(false);
        toast({ title: "Error", description: "An error occurred while reading the file.", variant: "destructive" });
      };
      reader.readAsDataURL(file);
    } else {
      setSelectedFileName(null);
      setSubmittedModelUrl(null);
      setModelFileExtension(null);
      setModelName(null);
      setModelHierarchy(null);
    }
  };

  const handleModelLoaded = useCallback((success: boolean, errorMessage?: string) => {
    setIsLoading(false);
    if (!success) {
      setError(errorMessage || "Failed to load model.");
      setModelHierarchy(null); // Clear hierarchy on load error
      toast({ title: "Load Error", description: errorMessage || "Failed to load model. Ensure the file is a valid 3D model (GLB, GLTF, OBJ).", variant: "destructive" });
    } else {
      setError(null); 
      if (selectedFileName) {
         toast({ title: "Success", description: `${selectedFileName} loaded successfully.` });
      }
    }
  }, [toast, selectedFileName]);

  const handleCameraReady = useCallback((camera: ArcRotateCamera) => {
    cameraRef.current = camera;
  }, []);

  const handleModelHierarchyReady = useCallback((hierarchy: ModelNode[]) => {
    setModelHierarchy(hierarchy);
  }, []);

  const triggerFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleFpsUpdate = useCallback((fps: number) => {
    setCurrentFps(Math.round(fps));
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <header className="p-4 shadow-md bg-card flex-shrink-0 z-10">
        <div className="container mx-auto flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <IterationCcw className="h-8 w-8 text-accent" />
            <h1 className="text-2xl font-semibold text-primary whitespace-nowrap">Open3D Viewer</h1>
          </div>
          <div className="flex flex-grow gap-2 items-center w-full sm:w-auto">
            <Input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelected}
              className="hidden" 
              accept=".glb,.gltf,.obj"
              aria-label="3D Model File"
            />
            <Button onClick={triggerFileDialog} variant="outline" className="flex-grow justify-start text-muted-foreground">
              <UploadCloud className="mr-2 h-4 w-4" />
              {selectedFileName || "Click to select a 3D model file (.glb, .gltf, .obj)"}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-grow overflow-hidden"> {/* Container for viewer and side panel */}
        <main className="flex-grow relative h-full"> {/* Main viewer area */}
          <BabylonViewer
            modelUrl={submittedModelUrl}
            modelFileExtension={modelFileExtension}
            onModelLoaded={handleModelLoaded}
            onCameraReady={handleCameraReady}
            onFpsUpdate={handleFpsUpdate}
            renderingMode={renderingMode}
            onModelHierarchyReady={handleModelHierarchyReady}
          />

          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-30">
              <div className="flex flex-col items-center">
                <svg className="animate-spin h-10 w-10 text-primary mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-foreground text-lg">Loading 3D Model...</p>
                {selectedFileName && <p className="text-muted-foreground text-sm">File: {selectedFileName}</p>}
              </div>
            </div>
          )}

          {!isLoading && error && ( 
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-20 p-4">
              <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
              <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading Model</h2>
              <p className="text-muted-foreground text-center max-w-md">{error}</p>
              <p className="text-muted-foreground text-sm mt-2">
                Please ensure the selected file is a valid 3D model (e.g., .glb, .gltf, .obj) and not corrupted.
              </p>
            </div>
          )}

          {!isLoading && !error && !submittedModelUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-20 p-4 text-center">
              <UploadCloud className="w-24 h-24 text-muted-foreground mb-6" />
              <h2 className="text-2xl font-semibold text-foreground mb-2">Welcome to Open3D Viewer</h2>
              <p className="text-muted-foreground max-w-md mb-4">
                Click the button above to select a 3D model file from your computer.
              </p>
              <p className="text-muted-foreground text-sm">
                Supported formats: .glb, .gltf, .obj
              </p>
            </div>
          )}
           {/* FPS Display and Rendering Mode Buttons positioned relative to this main container */}
            {submittedModelUrl && !error && !isLoading && (
              <>
                <div className="absolute bottom-4 right-4 bg-card/90 text-card-foreground p-2 rounded-md shadow-md border border-border z-20 text-sm">
                  FPS: {currentFps}
                </div>
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 flex gap-2">
                  <Button
                    variant={renderingMode === 'shaded' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRenderingMode('shaded')}
                  >
                    Shaded
                  </Button>
                  <Button
                    variant={renderingMode === 'non-shaded' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRenderingMode('non-shaded')}
                  >
                    Non-Shaded
                  </Button>
                  <Button
                    variant={renderingMode === 'wireframe' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setRenderingMode('wireframe')}
                  >
                    Wireframe
                  </Button>
                </div>
              </>
            )}
        </main>

        {/* Details Panel */}
        {submittedModelUrl && !error && !isLoading && (
          <aside className="w-80 bg-card border-l border-border p-4 overflow-y-auto flex-shrink-0 h-full">
            <h2 className="text-xl font-semibold mb-4 text-primary sticky top-0 bg-card py-2 z-10">Details</h2>
            <Accordion type="single" collapsible defaultValue="object" className="w-full">
              <AccordionItem value="object">
                <AccordionTrigger>Object</AccordionTrigger>
                <AccordionContent>
                  {modelName && <p className="font-semibold mb-1 text-foreground">Name: <span className="font-normal text-muted-foreground">{modelName}</span></p>}
                  {modelHierarchy && modelHierarchy.length > 0 ? (
                    <>
                      <h3 className="font-semibold mt-3 mb-1 text-foreground">Hierarchy:</h3>
                      <ul className="list-none p-0 space-y-1 max-h-96 overflow-y-auto">
                        {modelHierarchy.map(node => <ModelHierarchyView key={node.id} node={node} defaultOpen={modelHierarchy.length === 1} />)}
                      </ul>
                    </>
                  ) : modelName ? (
                     <p className="text-sm text-muted-foreground italic mt-2">No hierarchy data was extracted from the model, or the model has no nested structure.</p>
                  ): (
                    <p className="text-sm text-muted-foreground italic">No model loaded or hierarchy data available.</p>
                  )}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="materials">
                <AccordionTrigger>Materials</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground italic">Material details will be implemented later.</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </aside>
        )}
      </div>
    </div>
  );
}
    
