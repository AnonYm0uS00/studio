
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";


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
  // const [modelHierarchy, setModelHierarchy] = useState<ModelNode[] | null>(null); // Hierarchy removed from UI

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFileName(file.name);
      setModelName(file.name); 

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
    }
  };

  const handleModelLoaded = useCallback((success: boolean, errorMessage?: string) => {
    setIsLoading(false);
    if (!success) {
      setError(errorMessage || "Failed to load model.");
      toast({ title: "Load Error", description: errorMessage || "Failed to load model. Ensure the file is a valid 3D model (GLB, GLTF, OBJ).", variant: "destructive" });
    } else {
      setError(null); 
    }
  }, [toast]);

  const handleCameraReady = useCallback((camera: ArcRotateCamera) => {
    cameraRef.current = camera;
  }, []);


  const triggerFileDialog = () => {
    fileInputRef.current?.click();
  };

  const handleFpsUpdate = useCallback((fps: number) => {
    setCurrentFps(Math.round(fps));
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <header className="p-4 shadow-md bg-card/70 backdrop-blur-md flex-shrink-0 z-10">
        <div className="container mx-auto flex items-center justify-center sm:justify-start gap-2">
          <IterationCcw className="h-8 w-8 text-accent" />
          <h1 className="text-2xl font-semibold text-primary whitespace-nowrap">Open3D Viewer</h1>
        </div>
      </header>

      <div className="flex flex-grow overflow-hidden"> 
        {!submittedModelUrl && !isLoading && !error ? (
            <main className="flex-grow relative h-full flex items-center justify-center p-4">
                <Card className="w-full max-w-md shadow-xl bg-card/70 backdrop-blur-md">
                    <CardHeader>
                        <CardTitle className="text-center text-2xl">Upload 3D Model</CardTitle>
                        <CardDescription className="text-center">
                            Select a 3D model file from your computer to view it.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col items-center gap-4">
                        <Input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileSelected}
                            className="hidden"
                            accept=".glb,.gltf,.obj"
                            aria-label="3D Model File"
                        />
                        <Button onClick={triggerFileDialog} variant="default" size="lg" className="w-full">
                            <UploadCloud className="mr-2 h-5 w-5" />
                            {selectedFileName ? "Change File" : "Select 3D Model File"}
                        </Button>
                        {selectedFileName && (
                            <p className="text-sm text-muted-foreground">Selected: {selectedFileName}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                            Supported formats: .glb, .gltf, .obj
                        </p>
                    </CardContent>
                </Card>
            </main>
        ) : (
            <>
                <main className="flex-grow relative h-full"> 
                <BabylonViewer
                    modelUrl={submittedModelUrl}
                    modelFileExtension={modelFileExtension}
                    onModelLoaded={handleModelLoaded}
                    onCameraReady={handleCameraReady}
                    onFpsUpdate={handleFpsUpdate}
                    renderingMode={renderingMode}
                />

                {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-30">
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
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-20 p-4">
                    <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
                    <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading Model</h2>
                    <p className="text-muted-foreground text-center max-w-md">{error}</p>
                    <p className="text-muted-foreground text-sm mt-2">
                        Please ensure the selected file is a valid 3D model (e.g., .glb, .gltf, .obj) and not corrupted.
                    </p>
                    </div>
                )}

                {submittedModelUrl && !error && !isLoading && (
                    <>
                        <div className="absolute bottom-4 right-4 bg-card/80 backdrop-blur-md text-card-foreground p-2 rounded-md shadow-md border border-border z-20 text-sm">
                        FPS: {currentFps}
                        </div>
                        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 flex gap-2 p-2 rounded-md bg-card/70 backdrop-blur-md shadow-md border border-border">
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

                {submittedModelUrl && !error && !isLoading && (
                <aside className="w-80 bg-card/70 backdrop-blur-md border-l border-border p-4 overflow-y-auto flex-shrink-0 h-full">
                    <h2 className="text-xl font-semibold mb-4 text-primary sticky top-0 bg-card/0 py-2 z-10">Details</h2>
                    <Accordion type="multiple" defaultValue={["object"]} className="w-full">
                    <AccordionItem value="object">
                        <AccordionTrigger>Object</AccordionTrigger>
                        <AccordionContent>
                        {modelName && <p className="font-semibold mb-1 text-foreground">Name: <span className="font-normal text-muted-foreground">{modelName}</span></p>}
                        {!modelName && <p className="text-sm text-muted-foreground italic">No model loaded or name available.</p>}
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
            </>
        )}
      </div>
    </div>
  );
}
    
