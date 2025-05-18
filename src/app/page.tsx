
'use client';
import { useState, useRef, useCallback, useEffect, ChangeEvent, DragEvent } from 'react';
import type { ArcRotateCamera } from '@babylonjs/core';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { BabylonViewer } from '@/components/babylon-viewer';
import { AlertTriangle, UploadCloud, FileText, Settings, InfoIcon, Camera, Focus, Grid, RotateCw, PanelLeftClose, PanelLeftOpen, Play, Pause, TimerIcon, Sun, Moon, Laptop, PackageIcon, HelpCircle, GithubIcon } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";


type Theme = "light" | "dark" | "system";
type EffectiveTheme = "light" | "dark";
export type RenderingMode = 'shaded' | 'non-shaded' | 'wireframe';

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = window.atob(base64.split(',')[1]);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const getAllMeshIdsFromHierarchy = (nodes: ModelNode[]): string[] => {
  let ids: string[] = [];
  for (const node of nodes) {
    if (node.type === 'Mesh' || node.type === 'InstancedMesh' || node.type === 'AbstractMesh') {
      ids.push(node.id);
    }
    if (node.children && node.children.length > 0) {
      ids = ids.concat(getAllMeshIdsFromHierarchy(node.children));
    }
  }
  return ids;
};


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
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);

  const [hasAnimations, setHasAnimations] = useState<boolean>(false);
  const [isPlayingAnimation, setIsPlayingAnimation] = useState<boolean>(false);
  const [animationProgress, setAnimationProgress] = useState<number>(0); 
  const [animationDurationSeconds, setAnimationDurationSeconds] = useState<number>(0);
  const [animationCurrentTimeSeconds, setAnimationCurrentTimeSeconds] = useState<number>(0);
  
  const [requestPlayAnimation, setRequestPlayAnimation] = useState<boolean | undefined>(undefined);
  const [requestAnimationSeek, setRequestAnimationSeek] = useState<number | undefined>(undefined);

  const [requestScreenshot, setRequestScreenshot] = useState<boolean>(false);
  const [requestFocusObject, setRequestFocusObject] = useState<boolean>(false);
  const [hiddenMeshIds, setHiddenMeshIds] = useState<Set<string>>(new Set());
  const [isSoloActive, setIsSoloActive] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const acceptedFileTypes = ".glb,.gltf,.obj";


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

  const processFile = useCallback((file: File | null) => {
    if (!file) {
      return;
    }

    setSelectedFileName(null);
    setModelName(null);
    setModelFileExtension(null);
    setError(null);
    setSubmittedModelUrl(null);
    setModelHierarchy([]);
    setMaterialDetails([]);
    setHiddenMeshIds(new Set());
    setIsSoloActive(false);
    setHasAnimations(false);
    setIsPlayingAnimation(false);
    setAnimationProgress(0);
    setAnimationDurationSeconds(0);
    setAnimationCurrentTimeSeconds(0);
    setRequestPlayAnimation(undefined);
    setRequestAnimationSeek(undefined);

    setSelectedFileName(file.name);
    setModelName(file.name);
    const nameParts = file.name.split('.');
    const ext = nameParts.length > 1 ? `.${nameParts.pop()?.toLowerCase()}` : '';

    if (!acceptedFileTypes.split(',').includes(ext)) {
      toast({
        title: "Invalid File Type",
        description: `Please upload a supported file type: ${acceptedFileTypes}`,
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }
    setModelFileExtension(ext);
    setIsLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setSubmittedModelUrl(e.target.result as string);
      } else {
        setError("Failed to read file.");
        setIsLoading(false);
      }
    };
    reader.onerror = () => {
      setError("Error reading file.");
      setIsLoading(false);
    };
    reader.readAsDataURL(file);
  }, [acceptedFileTypes, toast]);


  const handleFileSelected = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      if (event.target) {
        event.target.value = ""; 
      }
      return;
    }
    processFile(files[0]);
    if (event.target) {
      event.target.value = ""; 
    }
  }, [processFile]);

  const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      const droppedFile = event.dataTransfer.files[0]; // Process only the first dropped file
      if (droppedFile) {
        processFile(droppedFile);
      }
      event.dataTransfer.clearData();
    }
  }, [processFile]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.__TAURI_IPC__) {
      const setupTauriListeners = async () => {
        try {
          const { listen, Event: TauriEvent } = await import('@tauri-apps/api/event');
          const { readBinaryFile } = await import('@tauri-apps/api/fs');
          const { basename } = await import('@tauri-apps/api/path');

          const unlistenFileDrop = await listen('tauri://file-drop', async (event: TauriEvent<string[]>) => {
            const paths = event.payload;
            if (paths && paths.length > 0) {
              try {
                setIsLoading(true);
                const filePath = paths[0]; // Process only the first dropped file path
                const name = await basename(filePath);
                const binaryData = await readBinaryFile(filePath);
                let mimeType = 'application/octet-stream';
                const lowerName = name.toLowerCase();
                if (lowerName.endsWith('.glb')) mimeType = 'model/gltf-binary';
                else if (lowerName.endsWith('.gltf')) mimeType = 'model/gltf+json';
                else if (lowerName.endsWith('.obj')) mimeType = 'text/plain'; // Or 'model/obj' - but text/plain is safer for DataURL
                // Add other MIME types as needed, but MTL specific loading is removed
                const file = new File([binaryData], name, { type: mimeType });
                processFile(file);
              } catch (err) {
                console.error("Tauri file drop processing error:", err);
                setError("Failed to process dropped file via Tauri.");
                toast({
                  title: "File Drop Error",
                  description: "Could not process the dropped file. " + (err instanceof Error ? err.message : String(err)),
                  variant: "destructive",
                });
                setIsLoading(false);
              }
            }
             setIsDraggingOver(false); // Ensure dragging state is reset
          });

          const unlistenDragHover = await listen('tauri://file-drop-hover', () => {
            if (!submittedModelUrl && !isLoading) {
               setIsDraggingOver(true);
            }
          });

          const unlistenDragCancelled = await listen('tauri://file-drop-cancelled', () => {
             setIsDraggingOver(false);
          });

          return () => {
            unlistenFileDrop();
            unlistenDragHover();
            unlistenDragCancelled();
          };
        } catch (e) {
            console.warn("Failed to set up Tauri listeners. Running in browser mode or Tauri API not available.", e);
        }
      };
      
      let cleanupFunction: (() => void) | undefined;
      setupTauriListeners().then(cleanup => {
        if (cleanup) {
            cleanupFunction = cleanup;
        }
      });
      
      return () => {
        if (cleanupFunction) {
            cleanupFunction();
        }
      };
    }
  }, [processFile, submittedModelUrl, isLoading, toast]);

  const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!submittedModelUrl && !isLoading) {
        setIsDraggingOver(true);
    }
  }, [submittedModelUrl, isLoading]);

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setTimeout(() => {
        const relatedTarget = event.relatedTarget as Node;
        if (!event.currentTarget.contains(relatedTarget)) {
            setIsDraggingOver(false);
        }
    }, 50);
  }, []);


  const handleModelLoaded = useCallback((success: boolean, errorMessage?: string) => {
    setIsLoading(false);
    if (!success) {
      setError(errorMessage || "Failed to load model.");
      // Toast removed for model loaded successfully.
      // toast({ title: "Load Error", description: errorMessage || "Failed to load model. Ensure the file is a valid 3D model.", variant: "destructive" });
      setModelHierarchy([]);
      setMaterialDetails([]);
      setHiddenMeshIds(new Set());
      setIsSoloActive(false);
      setHasAnimations(false);
    } else {
      setError(null); 
    }
  }, []);

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

  const toggleExplorerPanel = useCallback(() => {
    setIsExplorerCollapsed(prev => !prev);
  }, []);

  const handleScreenshotTaken = useCallback(async (dataUrl: string) => {
    if (typeof window !== 'undefined' && window.__TAURI_IPC__) {
      try {
        const { writeFile, createDir, exists } = await import('@tauri-apps/api/fs');
        const { pictureDir, join } = await import('@tauri-apps/api/path');
        
        const picturesPath = await pictureDir();
        const capturesDir = await join(picturesPath, 'Open3D_Captures');

        if (!await exists(capturesDir)) {
          await createDir(capturesDir, { recursive: true });
        }
        
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const fileName = `Open3D_Capture_${timestamp}.png`;
        const filePath = await join(capturesDir, fileName);

        const binaryData = base64ToUint8Array(dataUrl);
        await writeFile({ path: filePath, contents: binaryData });

        toast({ title: "Screenshot Saved", description: `Image saved to ${filePath}` });

      } catch (e) {
        console.error("Tauri screenshot save error:", e);
        toast({ title: "Save Error", description: "Could not save screenshot via Tauri. " + (e instanceof Error ? e.message : String(e)), variant: "destructive" });
        const link = document.createElement('a');
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        link.download = `Open3D_Capture_${timestamp}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } finally {
        setRequestScreenshot(false);
      }
    } else {
      const link = document.createElement('a');
      const now = new Date();
      const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
      link.download = `Open3D_Capture_${timestamp}.png`;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setRequestScreenshot(false); 
      toast({ title: "Screenshot Captured", description: "Image downloaded successfully." });
    }
  }, [toast]);

  const handleObjectFocused = useCallback(() => {
    setRequestFocusObject(false);
  }, []);

  const handleToggleMeshVisibility = useCallback((meshId: string, ctrlPressed: boolean) => {
    if (ctrlPressed) {
      if (isSoloActive) {
        setHiddenMeshIds(new Set());
        setIsSoloActive(false);
      } else {
        const allIdsInScene = getAllMeshIdsFromHierarchy(modelHierarchy);
        const newHiddenIds = new Set<string>();
        for (const id of allIdsInScene) {
          if (id !== meshId) {
            newHiddenIds.add(id);
          }
        }
        setHiddenMeshIds(newHiddenIds);
        setIsSoloActive(true);
      }
    } else {
      setIsSoloActive(false);
      setHiddenMeshIds(prevIds => {
        const newIds = new Set(prevIds);
        if (newIds.has(meshId)) {
          newIds.delete(meshId);
        } else {
          newIds.add(meshId);
        }
        return newIds;
      });
    }
  }, [modelHierarchy, isSoloActive]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
    }
    
    if (event.altKey && event.key.toLowerCase() === 'g') {
      event.preventDefault();
      setIsGridVisible(prev => !prev);
    } else if (event.ctrlKey && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      triggerFileDialog();
    } else if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      if (submittedModelUrl && !isLoading && !error) {
        setRequestFocusObject(true);
      }
    } else if (!event.ctrlKey && !event.altKey && !event.metaKey && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      toggleExplorerPanel();
    } else if (!event.ctrlKey && !event.altKey && !event.metaKey ) { 
        switch (event.key) {
            case '1':
                event.preventDefault();
                setRenderingMode('shaded');
                break;
            case '2':
                event.preventDefault();
                setRenderingMode('non-shaded');
                break;
            case '3':
                event.preventDefault();
                setRenderingMode('wireframe');
                break;
            default:
                break;
        }
    }
  }, [triggerFileDialog, submittedModelUrl, isLoading, error, toggleExplorerPanel, setIsGridVisible, setRequestFocusObject, setRenderingMode]); 

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]); 

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);


  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Top Bar */}
      <header className="h-12 flex-shrink-0 border-b border-border bg-card/70 backdrop-blur-md flex items-center px-4 justify-between shadow-md">
        <h1 className="text-lg font-semibold text-primary">Open3D Viewer</h1>
        <div className="text-sm text-muted-foreground">{modelName || "No model loaded"}</div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-muted-foreground hover:text-accent-foreground h-8 w-8"
            onClick={triggerFileDialog}
            title="Open new file (Ctrl+N)"
          >
            <FileText className="h-4 w-4" />
            <span className="sr-only">Open File</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent-foreground h-8 w-8" title="Settings">
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
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-accent-foreground h-8 w-8" title="Info">
                    <InfoIcon className="h-4 w-4" />
                    <span className="sr-only">Info</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="mr-2 w-56">
                <DropdownMenuLabel className="text-xs font-semibold">About</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <a href="https://github.com/Samscape0" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 w-full text-sm">
                        <GithubIcon className="h-3.5 w-3.5" /> Samscape0
                    </a>
                </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="flex flex-row flex-grow overflow-hidden">
        {/* Left Panel ("Model Explorer") */}
        <aside
          className={`bg-card/70 backdrop-blur-md border-r border-border flex flex-col shadow-lg transition-all duration-300 ease-in-out
            ${isExplorerCollapsed ? 'w-16' : 'w-72'}`}
        >
          <div
            className={`flex items-center h-12 border-b border-border
              ${isExplorerCollapsed ? 'justify-center px-2' : 'justify-between px-3'}`}
          >
            {!isExplorerCollapsed && (
              <h2 className="text-sm font-semibold text-primary">Model Explorer</h2>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleExplorerPanel}
              className="text-muted-foreground hover:text-accent-foreground h-7 w-7"
              title="Toggle Model Explorer (E)"
            >
              {isExplorerCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              <span className="sr-only">Toggle Model Explorer</span>
            </Button>
          </div>
          
          {!isExplorerCollapsed && (
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
                  <ScrollArea className="h-full">
                    <ul className="space-y-0.5">
                      {modelHierarchy.map(node => (
                        <ModelHierarchyView 
                          key={node.id} 
                          node={node} 
                          defaultOpen={true} 
                          hiddenMeshIds={hiddenMeshIds}
                          onToggleVisibility={handleToggleMeshVisibility}
                        />
                      ))}
                    </ul>
                  </ScrollArea>
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
          )}
        </aside>

        {/* Right Panel (Viewport / Upload Prompt) */}
        <main 
            className="flex-grow relative h-full bg-background"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <Input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelected}
                className="hidden"
                accept={acceptedFileTypes}
                aria-label="3D Model File"
            />
            {!submittedModelUrl && !isLoading && !error && (
                <div className="absolute inset-0 flex items-center justify-center p-4 bg-background">
                    <div
                        className={`flex flex-col items-center justify-center p-10 bg-card rounded-lg shadow-xl border border-border cursor-pointer backdrop-blur-md transition-all
                                    ${isDraggingOver ? 'border-accent ring-2 ring-accent ring-offset-2' : 'border-border'}`}
                        onClick={triggerFileDialog}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") triggerFileDialog();}}
                    >
                        <div className={`flex items-center justify-center h-20 w-20 rounded-full bg-muted mb-4 transition-colors ${isDraggingOver ? 'bg-accent/20' : ''}`}>
                            <UploadCloud className={`h-10 w-10 text-primary transition-colors ${isDraggingOver ? 'text-accent' : ''}`} />
                        </div>
                        <p className="text-lg font-medium text-foreground mb-1">Drag & Drop or Click to Upload</p>
                        <p className="text-xs text-muted-foreground">
                            Supported formats: .glb, .gltf, .obj.
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
                  requestScreenshot={requestScreenshot}
                  onScreenshotTaken={handleScreenshotTaken}
                  requestFocusObject={requestFocusObject}
                  onObjectFocused={handleObjectFocused}
                  hiddenMeshIds={hiddenMeshIds}
              />
            )}
            
            {submittedModelUrl && !isLoading && !error && (
              <>
                <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
                  <Button
                    variant={isGridVisible ? "secondary" : "outline"}
                    size="icon"
                    onClick={() => setIsGridVisible(!isGridVisible)}
                    title="Toggle Grid (Alt+G)"
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
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setRequestScreenshot(true)}
                    title="Capture Screenshot"
                    className="h-9 w-9 bg-card/80 backdrop-blur-md border-border shadow-md hover:bg-accent/80"
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setRequestFocusObject(true)}
                    title="Focus on Object (F)"
                    className="h-9 w-9 bg-card/80 backdrop-blur-md border-border shadow-md hover:bg-accent/80"
                  >
                    <Focus className="h-4 w-4" />
                  </Button>
                </div>

                 <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-4 right-4 z-10 h-9 w-9 bg-card/80 backdrop-blur-md border-border shadow-md hover:bg-accent/80 text-muted-foreground hover:text-accent-foreground"
                      title="Show Shortcuts"
                    >
                      <HelpCircle className="h-4 w-4" />
                      <span className="sr-only">Show Shortcuts</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="mr-4 w-auto text-xs p-3 bg-gradient-to-l from-transparent via-card/10 to-card/30 backdrop-blur-lg shadow-lg border-none">
                    <h3 className="font-semibold text-sm text-foreground mb-1">ShortKeys</h3>
                    <ul className="space-y-0.5 text-muted-foreground">
                        <li>Toggle Grid: <kbd>Alt</kbd> + <kbd>G</kbd></li>
                        <li>Open File: <kbd>Ctrl</kbd> + <kbd>N</kbd></li>
                        <li>Focus Model: <kbd>F</kbd></li>
                        <li>Toggle Explorer: <kbd>E</kbd></li>
                        <li>Shaded View: <kbd>1</kbd></li>
                        <li>Non-Shaded View: <kbd>2</kbd></li>
                        <li>Wireframe View: <kbd>3</kbd></li>
                    </ul>
                  </PopoverContent>
                </Popover>
              </>
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
                      title="Shaded (1)"
                    >
                      Shaded
                    </Button>
                    <Button
                      variant={renderingMode === 'non-shaded' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRenderingMode('non-shaded')}
                      className="text-xs h-7 px-2"
                       title="Non-Shaded (2)"
                    >
                      Non-Shaded
                    </Button>
                    <Button
                      variant={renderingMode === 'wireframe' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setRenderingMode('wireframe')}
                      className="text-xs h-7 px-2"
                      title="Wireframe (3)"
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
                    <>
                      <div className="flex items-center gap-2 w-full">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={handlePlayPauseToggle}
                          className="h-7 w-7 text-foreground"
                          title={isPlayingAnimation ? "Pause Animation" : "Play Animation"}
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
                    </>
                  </div>
                )}
              </>
            )}
        </main>
      </div>
      <footer className="h-10 flex-shrink-0 border-t border-border bg-card flex items-center px-4 text-sm text-muted-foreground justify-start shadow-sm">
        <p>Version: 0.2.0</p>
      </footer>
    </div>
  );
}

