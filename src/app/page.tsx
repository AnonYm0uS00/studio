
'use client';
import { useState, useRef, useCallback, useEffect, ChangeEvent } from 'react';
import type { ArcRotateCamera } from '@babylonjs/core';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BabylonViewer } from '@/components/babylon-viewer';
import { AlertTriangle, UploadCloud, FileText, Settings, InfoIcon, SlidersHorizontal, PackageIcon, Sun, Moon, Laptop, Grid, Play, Pause, TimerIcon, RotateCw } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ModelNode, MaterialDetail } from '@/components/types';
import { ModelHierarchyView } from '@/components/model-hierarchy-view';
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";


type Theme = "light" | "dark" | "system";
type EffectiveTheme = "light" | "dark";
export type RenderingMode = 'shaded' | 'non-shaded' | 'wireframe';

export default function Home() {
  const [submittedModelUrl, setSubmittedModelUrl] = useState<string | null>(null);
  const [modelFileExtension, setModelFileExtension] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<ArcRotateCamera | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const [modelName, setModelName] = useState<string | null>(null);
  const [modelHierarchy, setModelHierarchy] = useState<ModelNode[]>([]);
  const [materialDetails, setMaterialDetails] = useState<MaterialDetail[]>([]);
  const [currentFps, setCurrentFps] = useState<number>(0);
  const [renderingMode, setRenderingMode] = useState<RenderingMode>('shaded');

  const [nearClip, setNearClip] = useState<number>(0.1);
  const [farClip, setFarClip] = useState<number>(2000);
  const [theme, setTheme] = useState<Theme>("system");
  const [effectiveTheme, setEffectiveTheme] = useState<EffectiveTheme>('light');
  const [isGridVisible, setIsGridVisible] = useState<boolean>(true);
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(false);

  // Animation state
  const [hasAnimations, setHasAnimations] = useState<boolean>(false);
  const [isPlayingAnimation, setIsPlayingAnimation] = useState<boolean>(false);
  const [animationProgress, setAnimationProgress] = useState<number>(0); // 0-100
  const [animationDurationSeconds, setAnimationDurationSeconds] = useState<number>(0);
  const [animationCurrentTimeSeconds, setAnimationCurrentTimeSeconds] = useState<number>(0);
  
  const [requestPlayAnimation, setRequestPlayAnimation] = useState<boolean | undefined>(undefined);
  const [requestAnimationSeek, setRequestAnimationSeek] = useState<number | undefined>(undefined);


  useEffect(() => {
    const storedTheme = localStorage.getItem("theme") as Theme | null;
    const initialSystemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    let currentTheme: Theme = 'system';
    if (storedTheme) {
        currentTheme = storedTheme;
    }
    setTheme(currentTheme); 

    if (currentTheme === 'dark' || (currentTheme === 'system' && initialSystemIsDark)) {
      document.documentElement.classList.add("dark");
      setEffectiveTheme('dark');
    } else {
      document.documentElement.classList.remove("dark");
      setEffectiveTheme('light');
    }
  }, []); 

  useEffect(() => {
    const applyThemeSettings = () => {
      if (theme === "light") {
        document.documentElement.classList.remove("dark");
        localStorage.setItem("theme", "light");
        setEffectiveTheme('light');
      } else if (theme === "dark") {
        document.documentElement.classList.add("dark");
        localStorage.setItem("theme", "dark");
        setEffectiveTheme('dark');
      } else { 
        localStorage.removeItem("theme"); 
        const systemIsDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (systemIsDark) {
          document.documentElement.classList.add("dark");
          setEffectiveTheme('dark');
        } else {
          document.documentElement.classList.remove("dark");
          setEffectiveTheme('light');
        }
      }
    };

    applyThemeSettings();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        applyThemeSettings();
      };
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }
  }, [theme]); 


  const handleFileSelected = useCallback((event: ChangeEvent<HTMLInputElement>) => {
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
      setModelHierarchy([]); 
      setMaterialDetails([]);
      // Reset animation states
      setHasAnimations(false);
      setIsPlayingAnimation(false);
      setAnimationProgress(0);
      setAnimationDurationSeconds(0);
      setAnimationCurrentTimeSeconds(0);
      setRequestPlayAnimation(undefined);
      setRequestAnimationSeek(undefined);


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
      setModelHierarchy([]);
      setMaterialDetails([]);
      setHasAnimations(false);
    }
  }, [toast]);

  const handleModelLoaded = useCallback((success: boolean, errorMessage?: string) => {
    setIsLoading(false);
    if (!success) {
      setError(errorMessage || "Failed to load model.");
      toast({ title: "Load Error", description: errorMessage || "Failed to load model. Ensure the file is a valid 3D model (e.g., .glb, .gltf, .obj).", variant: "destructive" });
      setModelHierarchy([]);
      setMaterialDetails([]);
      setHasAnimations(false);
    } else {
      setError(null); 
    }
  }, [toast]);

  const handleCameraReady = useCallback((camera: ArcRotateCamera) => {
    cameraRef.current = camera;
  }, []);

  const handleModelHierarchyReady = useCallback((hierarchy: ModelNode[]) => {
    setModelHierarchy(hierarchy);
  }, []);

  const handleMaterialsReady = useCallback((materials: MaterialDetail[]) => {
    setMaterialDetails(materials);
  }, []);

  const handleFpsUpdate = useCallback((fps: number) => {
    setCurrentFps(Math.round(fps));
  }, []);


  const triggerFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAnimationsAvailable = useCallback((available: boolean, duration: number) => {
    setHasAnimations(available);
    setAnimationDurationSeconds(duration);
    setAnimationProgress(0);
    setAnimationCurrentTimeSeconds(0);
    setIsPlayingAnimation(false); 
    setRequestPlayAnimation(false); 
    setRequestAnimationSeek(0); 
  }, []);

  const handleAnimationStateChange = useCallback((isPlaying: boolean) => {
    setIsPlayingAnimation(isPlaying);
    if (!isPlaying) {
        setRequestPlayAnimation(false);
    }
  }, []);

  const handleAnimationProgressUpdate = useCallback((progress: number, currentTime: number) => {
    setAnimationProgress(progress);
    setAnimationCurrentTimeSeconds(currentTime);
  }, []);

  const handlePlayPauseToggle = useCallback(() => {
    const newPlayState = !isPlayingAnimation;
    setIsPlayingAnimation(newPlayState);
    setRequestPlayAnimation(newPlayState);
  }, [isPlayingAnimation]);

  const handleAnimationSliderChange = useCallback((value: number[]) => {
    const newProgress = value[0];
    setAnimationProgress(newProgress);
    setRequestAnimationSeek(newProgress);
    setRequestPlayAnimation(isPlayingAnimation); 
  }, [isPlayingAnimation]);

  const formatTime = (timeInSeconds: number): string => {
    const totalSeconds = Math.floor(timeInSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };


  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top Bar */}
      <header className="h-12 flex-shrink-0 border-b border-border bg-card/70 backdrop-blur-md flex items-center px-4 justify-between shadow-md">
        <h1 className="text-lg font-semibold text-primary">3D Viewer</h1>
        <div className="text-sm text-muted-foreground">{modelName || "No model loaded"}</div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent-foreground h-8 w-8">
            <FileText className="h-4 w-4" />
            <span className="sr-only">Documentation</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent-foreground h-8 w-8">
                <Settings className="h-4 w-4" />
                <span className="sr-only">Settings</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-64 mr-2">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-semibold">Clipping Planes</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="focus:bg-transparent">
                  <div className="w-full space-y-2">
                    <label htmlFor="nearClipSlider" className="text-xs text-muted-foreground">Near: {nearClip.toFixed(2)}</label>
                    <Slider
                      id="nearClipSlider"
                      value={[nearClip]}
                      onValueChange={(value) => setNearClip(value[0])}
                      min={0.01}
                      max={10}
                      step={0.01}
                      className="w-full"
                    />
                  </div>
                </DropdownMenuItem>
                 <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="focus:bg-transparent">
                  <div className="w-full space-y-2">
                    <label htmlFor="farClipSlider" className="text-xs text-muted-foreground">Far: {farClip.toFixed(0)}</label>
                    <Slider
                      id="farClipSlider"
                      value={[farClip]}
                      onValueChange={(value) => setFarClip(value[0])}
                      min={100}
                      max={10000}
                      step={100}
                      className="w-full"
                    />
                  </div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs font-semibold">Theme</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
                  <DropdownMenuRadioItem value="light" className="text-xs">
                    <Sun className="mr-2 h-3.5 w-3.5" /> Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark" className="text-xs">
                    <Moon className="mr-2 h-3.5 w-3.5" /> Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="system" className="text-xs">
                    <Laptop className="mr-2 h-3.5 w-3.5" /> System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent-foreground h-8 w-8">
            <InfoIcon className="h-4 w-4" />
            <span className="sr-only">Info</span>
          </Button>
        </div>
      </header>

      <div className="flex flex-row flex-grow overflow-hidden">
        {/* Left Panel ("Model Explorer") */}
        <aside className="w-72 bg-card/70 backdrop-blur-md border-r border-border flex flex-col p-0 shadow-lg">
          <div className="p-3 border-b border-border flex items-center justify-between h-12">
            <h2 className="text-sm font-semibold text-primary">Model Explorer</h2>
            <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent-foreground h-7 w-7">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="sr-only">Toggle controls</span>
            </Button>
          </div>
          <Tabs defaultValue="info" className="w-full flex flex-col flex-grow p-3">
            <TabsList className="grid w-full grid-cols-3 h-9">
              <TabsTrigger value="info" className="text-xs h-7">Info</TabsTrigger>
              <TabsTrigger value="scene" className="text-xs h-7">Scene</TabsTrigger>
              <TabsTrigger value="materials" className="text-xs h-7">Materials</TabsTrigger>
            </TabsList>
            <TabsContent value="info" className="flex-grow mt-3 overflow-y-auto">
              {!submittedModelUrl && !isLoading && !error ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <PackageIcon className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-foreground">No model loaded</p>
                  <p className="text-xs text-muted-foreground">Open a 3D model to view its information.</p>
                </div>
              ) : modelName && !error ? (
                 <div className="p-2 space-y-1">
                    <p className="text-sm font-semibold text-foreground">Filename: <span className="font-normal text-muted-foreground">{modelName && (modelName.lastIndexOf('.') > 0 ? modelName.substring(0, modelName.lastIndexOf('.')) : modelName)}</span></p>
                    <p className="text-sm font-semibold text-foreground">File Path: <span className="font-normal text-muted-foreground break-all">{selectedFileName}</span></p>
                    {modelFileExtension && <p className="text-sm font-semibold text-foreground">File Format: <span className="font-normal text-muted-foreground">{modelFileExtension.toUpperCase()}</span></p>}
                 </div>
              ) : null }
            </TabsContent>
            <TabsContent value="scene" className="flex-grow mt-3 overflow-y-auto">
               {modelHierarchy.length > 0 ? (
                <ul className="space-y-0.5">
                  {modelHierarchy.map(node => (
                    <ModelHierarchyView key={node.id} node={node} defaultOpen={true} />
                  ))}
                </ul>
              ) : submittedModelUrl && !isLoading && !error ? (
                 <p className="text-sm text-muted-foreground italic p-2">Model loaded, but no hierarchy data to display or model is empty.</p>
              ) : !isLoading && !error && (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <PackageIcon className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-foreground">No model loaded</p>
                  <p className="text-xs text-muted-foreground">The scene hierarchy will appear here.</p>
                </div>
              )}
            </TabsContent>
            <TabsContent value="materials" className="flex-grow mt-3 overflow-y-auto">
              {!submittedModelUrl && !isLoading && !error ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-4">
                  <PackageIcon className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-sm font-medium text-foreground">No model loaded</p>
                  <p className="text-xs text-muted-foreground">Open a 3D model to view its materials.</p>
                </div>
              ) : isLoading ? (
                <p className="text-sm text-muted-foreground italic p-2">Loading materials...</p>
              ) : error ? (
                <p className="text-sm text-destructive italic p-2">Error loading model, materials unavailable.</p>
              ) : materialDetails.length > 0 ? (
                <ScrollArea className="h-full">
                  <div className="space-y-2 p-1">
                    {materialDetails.map((mat) => (
                      <div key={mat.id} className="rounded-md border border-border bg-card p-2 text-sm shadow-sm">
                        <p className="font-semibold text-foreground truncate" title={mat.name}>{mat.name}</p>
                        <p className="text-xs text-muted-foreground">Type: {mat.type}</p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-muted-foreground italic p-2">No materials found in this model.</p>
              )}
            </TabsContent>
          </Tabs>
        </aside>

        {/* Right Panel (Viewport / Upload Prompt) */}
        <main className="flex-grow relative h-full bg-background">
            <Input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelected}
                className="hidden"
                accept=".glb,.gltf,.obj"
                aria-label="3D Model File"
            />
            {!submittedModelUrl && !isLoading && !error && (
                <div className="absolute inset-0 flex items-center justify-center p-4 bg-background">
                    <div
                        className="flex flex-col items-center justify-center p-10 bg-card rounded-lg shadow-xl border border-border cursor-pointer backdrop-blur-md"
                        onClick={triggerFileDialog}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") triggerFileDialog();}}
                    >
                        <div className="flex items-center justify-center h-20 w-20 rounded-full bg-muted mb-4">
                            <UploadCloud className="h-10 w-10 text-primary" />
                        </div>
                        <p className="text-lg font-medium text-foreground mb-1">Drag & Drop or Click to Upload</p>
                        <p className="text-xs text-muted-foreground">
                            Supported formats: .glb, .gltf, .obj
                        </p>
                        <Button variant="link" size="sm" className="mt-2 text-accent invisible">
                          Or click to select a file
                        </Button>
                    </div>
                </div>
            )}

            {(submittedModelUrl || isLoading || error) && (
              <BabylonViewer
                  modelUrl={submittedModelUrl}
                  modelFileExtension={modelFileExtension}
                  onModelLoaded={handleModelLoaded}
                  onCameraReady={handleCameraReady}
                  onFpsUpdate={handleFpsUpdate}
                  onModelHierarchyReady={handleModelHierarchyReady}
                  onMaterialsReady={handleMaterialsReady}
                  renderingMode={renderingMode}
                  nearClip={nearClip}
                  farClip={farClip}
                  effectiveTheme={effectiveTheme}
                  isGridVisible={isGridVisible}
                  isAutoRotating={isAutoRotating}
                  requestPlayAnimation={requestPlayAnimation}
                  requestAnimationSeek={requestAnimationSeek}
                  onAnimationsAvailable={handleAnimationsAvailable}
                  onAnimationStateChange={handleAnimationStateChange}
                  onAnimationProgressUpdate={handleAnimationProgressUpdate}
              />
            )}
            
            {submittedModelUrl && !isLoading && !error && (
              <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                <Button
                  variant={isGridVisible ? "secondary" : "outline"}
                  size="icon"
                  onClick={() => setIsGridVisible(!isGridVisible)}
                  title={isGridVisible ? "Hide Grid" : "Show Grid"}
                  className="h-9 w-9 bg-card/80 backdrop-blur-md border-border shadow-md hover:bg-accent/80"
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={isAutoRotating ? "secondary" : "outline"}
                  size="icon"
                  onClick={() => setIsAutoRotating(!isAutoRotating)}
                  title={isAutoRotating ? "Stop Auto-Rotation" : "Start Auto-Rotation"}
                  className="h-9 w-9 bg-card/80 backdrop-blur-md border-border shadow-md hover:bg-accent/80"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </div>
            )}


            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-30">
                  <div className="flex flex-col items-center bg-card p-8 rounded-lg shadow-xl">
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
                <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-20 p-4">
                  <div className="bg-card p-8 rounded-lg shadow-xl text-center max-w-md">
                    <AlertTriangle className="w-16 h-16 text-destructive mb-4 mx-auto" />
                    <h2 className="text-xl font-semibold text-destructive mb-2">Error Loading Model</h2>
                    <p className="text-muted-foreground text-center">{error}</p>
                    <p className="text-muted-foreground text-sm mt-2">
                        Please ensure the selected file is a valid 3D model (e.g., .glb, .gltf, .obj) and not corrupted.
                    </p>
                    <Button onClick={triggerFileDialog} variant="outline" size="sm" className="mt-6">
                        Try a different file
                    </Button>
                  </div>
                </div>
            )}

            {submittedModelUrl && !isLoading && !error && (
              <>
                {/* Bottom-Right Controls: Rendering Mode & FPS */}
                <div className="absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
                  <div className="flex gap-1 p-1 bg-card/70 backdrop-blur-md rounded-md border border-border shadow-md">
                    <Button
                      variant={renderingMode === 'shaded' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRenderingMode('shaded')}
                      className="text-xs h-7 px-2"
                    >
                      Shaded
                    </Button>
                    <Button
                      variant={renderingMode === 'non-shaded' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRenderingMode('non-shaded')}
                      className="text-xs h-7 px-2"
                    >
                      Non-Shaded
                    </Button>
                    <Button
                      variant={renderingMode === 'wireframe' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRenderingMode('wireframe')}
                      className="text-xs h-7 px-2"
                    >
                      Wireframe
                    </Button>
                  </div>
                  <div className="px-3 py-1.5 bg-card/80 backdrop-blur-md rounded-md border border-border shadow-md text-xs text-muted-foreground">
                    FPS: {currentFps}
                  </div>
                </div>

                {/* Bottom-Center Controls: Animations */}
                {hasAnimations && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 p-2 bg-card/70 backdrop-blur-md rounded-md border border-border shadow-md w-80">
                    <div className="flex items-center gap-2 w-full">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handlePlayPauseToggle}
                        className="h-7 w-7 text-foreground"
                      >
                        {isPlayingAnimation ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Slider
                        value={[animationProgress]}
                        onValueChange={handleAnimationSliderChange}
                        min={0}
                        max={100}
                        step={0.1}
                        className="flex-grow"
                        aria-label="Animation progress"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <TimerIcon className="inline h-3 w-3 mr-1" />
                      {formatTime(animationCurrentTimeSeconds)} / {formatTime(animationDurationSeconds)}
                    </div>
                  </div>
                )}
              </>
            )}
        </main>
      </div>

      {/* Bottom Bar */}
      <footer className="h-8 flex-shrink-0 border-t border-border bg-card/70 backdrop-blur-md flex items-center px-4 shadow-md">
        <p className="text-xs text-muted-foreground">
            {isLoading ? "Loading model..." : error ? "Error loading model" : submittedModelUrl ? `Viewing: ${modelName}` : "Ready to load model"}
        </p>
      </footer>
    </div>
  );
}

