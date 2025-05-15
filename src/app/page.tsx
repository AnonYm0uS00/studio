'use client';
import { useState, useRef } from 'react';
import type { ArcRotateCamera } from '@babylonjs/core';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BabylonViewer } from '@/components/babylon-viewer';
import { RotateCcw, Move, ZoomIn, ZoomOut, AlertTriangle, IterationCcw } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [modelUrlInput, setModelUrlInput] = useState<string>('https://models.babylonjs.com/boombox.glb');
  const [submittedModelUrl, setSubmittedModelUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const { toast } = useToast();

  const handleLoadModel = () => {
    if (!modelUrlInput.trim()) {
      toast({ title: "Error", description: "Please enter a model URL.", variant: "destructive" });
      return;
    }
    setError(null);
    setIsLoading(true);
    setSubmittedModelUrl(modelUrlInput);
  };

  const handleModelLoaded = (success: boolean, errorMessage?: string) => {
    setIsLoading(false);
    if (!success) {
      setError(errorMessage || "Failed to load model.");
      toast({ title: "Load Error", description: errorMessage || "Failed to load model.", variant: "destructive" });
      // Do not clear submittedModelUrl here, BabylonViewer will handle retries or show empty if it's permanently bad
    } else {
      setError(null); // Clear previous errors on successful load
      toast({ title: "Success", description: "Model loaded successfully." });
    }
  };

  const handleCameraReady = (camera: ArcRotateCamera) => {
    cameraRef.current = camera;
  };

  const rotateCamera = (angleIncrement: number) => {
    if (cameraRef.current) {
      cameraRef.current.alpha += angleIncrement;
    }
  };

  const panCamera = (axis: 'x' | 'y', amount: number) => {
    if (cameraRef.current) {
      const panSpeed = cameraRef.current.radius * 0.02; // Adjust speed based on zoom
      const direction = cameraRef.current.getDirection(axis === 'x' ? new BABYLON.Vector3(1,0,0) : new BABYLON.Vector3(0,1,0));
      cameraRef.current.target.addInPlace(direction.scale(amount * panSpeed));
    }
  };
  
  const zoomCamera = (factor: number) => {
    if (cameraRef.current) {
      cameraRef.current.radius *= factor;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <header className="p-4 shadow-md bg-card flex-shrink-0">
        <div className="container mx-auto flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <IterationCcw className="h-8 w-8 text-accent" />
            <h1 className="text-2xl font-semibold text-primary whitespace-nowrap">Open3D Viewer</h1>
          </div>
          <div className="flex flex-grow gap-2 items-center w-full sm:w-auto">
            <Input
              type="url"
              placeholder="Enter 3D model URL (.glb, .gltf)"
              value={modelUrlInput}
              onChange={(e) => setModelUrlInput(e.target.value)}
              className="flex-grow min-w-0"
              aria-label="3D Model URL"
            />
            <Button onClick={handleLoadModel} disabled={isLoading} variant="default" className="bg-accent hover:bg-accent/90 text-accent-foreground">
              {isLoading ? 'Loading...' : 'Load Model'}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-grow relative">
        <BabylonViewer
          modelUrl={submittedModelUrl}
          onModelLoaded={handleModelLoaded}
          onCameraReady={handleCameraReady}
        />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 z-30">
            <div className="flex flex-col items-center">
              <svg className="animate-spin h-10 w-10 text-primary mb-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <p className="text-foreground text-lg">Loading 3D Model...</p>
            </div>
          </div>
        )}
        {error && !isLoading && !submittedModelUrl && ( /* Show error only if no model is trying to be displayed or loading */
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-20 p-4">
            <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
            <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading Model</h2>
            <p className="text-muted-foreground text-center max-w-md">{error}</p>
            <p className="text-muted-foreground text-sm mt-2">
              Please check the URL and ensure it points to a valid .glb or .gltf file. The server hosting the model must also allow cross-origin requests (CORS).
            </p>
          </div>
        )}
         {!submittedModelUrl && !isLoading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background z-20 p-4">
            <IterationCcw className="w-24 h-24 text-muted-foreground mb-6" />
            <h2 className="text-2xl font-semibold text-foreground mb-2">Welcome to Open3D Viewer</h2>
            <p className="text-muted-foreground text-center max-w-md">
              Enter a URL to a .glb or .gltf 3D model in the bar above and click "Load Model" to get started.
            </p>
             <p className="text-muted-foreground text-xs mt-4">
              Example: https://models.babylonjs.com/boombox.glb
            </p>
          </div>
        )}
      </main>

      {submittedModelUrl && !error && (
        <div className="absolute bottom-4 right-4 flex flex-col gap-2 z-20">
          <Button onClick={() => rotateCamera(0.1)} variant="outline" size="icon" aria-label="Rotate Left" className="bg-card/80 hover:bg-card border-border">
            <RotateCcw />
          </Button>
           <Button onClick={() => panCamera('y', 1)} variant="outline" size="icon" aria-label="Pan Up" className="bg-card/80 hover:bg-card border-border">
            <Move className="transform rotate-[-90deg]" />
          </Button>
          <Button onClick={() => panCamera('y', -1)} variant="outline" size="icon" aria-label="Pan Down" className="bg-card/80 hover:bg-card border-border">
            <Move className="transform rotate-[90deg]" />
          </Button>
          <Button onClick={() => zoomCamera(0.9)} variant="outline" size="icon" aria-label="Zoom In" className="bg-card/80 hover:bg-card border-border">
            <ZoomIn />
          </Button>
          <Button onClick={() => zoomCamera(1.1)} variant="outline" size="icon" aria-label="Zoom Out" className="bg-card/80 hover:bg-card border-border">
            <ZoomOut />
          </Button>
        </div>
      )}
    </div>
  );
}
