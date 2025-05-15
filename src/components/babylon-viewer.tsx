
'use client';
import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  SceneLoader,
  AbstractMesh,
  AssetContainer,
  Color4,
  Nullable,
  MeshBuilder,
  Color3,
  Material, 
  PBRMaterial, 
  StandardMaterial,
  MultiMaterial
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials';
import '@babylonjs/loaders/glTF'; // For GLTF/GLB support
import '@babylonjs/loaders/OBJ';  // For OBJ support

export type RenderingMode = 'shaded' | 'non-shaded' | 'wireframe';

interface BabylonViewerProps {
  modelUrl: string | null;
  modelFileExtension: string | null; 
  onModelLoaded: (success: boolean, error?: string) => void;
  onCameraReady: (camera: ArcRotateCamera) => void;
  onFpsUpdate?: (fps: number) => void;
  renderingMode: RenderingMode;
}

export const BabylonViewer: React.FC<BabylonViewerProps> = ({ 
  modelUrl, 
  modelFileExtension, 
  onModelLoaded, 
  onCameraReady,
  onFpsUpdate,
  renderingMode
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Nullable<Engine>>(null);
  const sceneRef = useRef<Nullable<Scene>>(null);
  const loadedAssetContainerRef = useRef<Nullable<AssetContainer>>(null);
  const [isCurrentModelActuallyLoaded, setIsCurrentModelActuallyLoaded] = useState(false);

  const applyRenderingModeStyle = useCallback((mode: RenderingMode, container: Nullable<AssetContainer>) => {
    if (!container || !sceneRef.current) return;

    container.meshes.forEach((mesh: AbstractMesh) => {
      if (mesh.material) {
        const processMaterial = (mat: Material) => {
          // General resets
          mat.wireframe = false;
          
          if (mat instanceof PBRMaterial) {
            mat.unlit = false;
          } else if (mat instanceof StandardMaterial) {
            mat.disableLighting = false;
          }

          // Apply new mode
          if (mode === 'wireframe') {
            mat.wireframe = true;
          } else if (mode === 'non-shaded') {
            if (mat instanceof PBRMaterial) {
              mat.unlit = true;
            } else if (mat instanceof StandardMaterial) {
              mat.disableLighting = true;
            }
          }
          // 'shaded' is the default state after resets
        };

        if (mesh.material instanceof MultiMaterial) {
            mesh.material.subMaterials.forEach(subMat => {
                if (subMat) processMaterial(subMat);
            });
        } else {
            processMaterial(mesh.material);
        }
      }
    });
  }, [sceneRef]); // sceneRef is stable

  // Effect for initial scene setup (engine, scene, camera, lights, grid, render loop)
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
    engineRef.current = engine;
    const scene = new Scene(engine);
    sceneRef.current = scene;
    
    scene.clearColor = new Color4(0, 0, 0, 0); 

    const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, Vector3.Zero(), scene);
    camera.attachControl(canvasRef.current, true);
    camera.wheelPrecision = 50;
    camera.lowerRadiusLimit = 0.1; 
    camera.upperRadiusLimit = 1000;
    onCameraReady(camera);

    new HemisphericLight("light1", new Vector3(1, 1, 0), scene);
    new HemisphericLight("light2", new Vector3(-1, -1, -0.5), scene);

    const ground = MeshBuilder.CreateGround("grid", {width: 100, height: 100, subdivisions: 10}, scene);
    const gridMaterial = new GridMaterial("gridMaterial", scene);
    gridMaterial.majorUnitFrequency = 10;
    gridMaterial.minorUnitVisibility = 0.45;
    gridMaterial.gridRatio = 1;
    gridMaterial.mainColor = Color3.FromHexString("#333333"); 
    gridMaterial.lineColor = Color3.FromHexString("#595959"); 
    gridMaterial.opacity = 0.98;
    gridMaterial.useMaxLine = true;
    ground.material = gridMaterial;
    ground.isPickable = false;
    ground.position.y = 0;

    engine.runRenderLoop(() => {
      if (sceneRef.current) {
        sceneRef.current.render();
        if (onFpsUpdate && engineRef.current) {
          onFpsUpdate(engineRef.current.getFps());
        }
      }
    });

    const resizeObserver = new ResizeObserver(() => {
      if (engineRef.current) {
        engineRef.current.resize();
      }
    });
    resizeObserver.observe(canvasRef.current);

    return () => {
      resizeObserver.disconnect();
      if (sceneRef.current) {
        sceneRef.current.dispose(); // This will dispose meshes, materials, lights etc.
        sceneRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      // Asset container is disposed in the model loading effect
    };
  }, [onCameraReady, onFpsUpdate]); // Only depends on stable callbacks

  // Effect for loading models
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !onModelLoaded) return; // Ensure onModelLoaded is defined

    // Reset loaded state when modelUrl or extension changes
    setIsCurrentModelActuallyLoaded(false);

    if (loadedAssetContainerRef.current) {
      loadedAssetContainerRef.current.dispose();
      loadedAssetContainerRef.current = null;
    }
    
    if (!modelUrl) {
        const camera = scene.activeCamera as ArcRotateCamera;
        if (camera) {
            camera.target = Vector3.Zero();
            camera.radius = 10; 
            camera.alpha = -Math.PI / 2;
            camera.beta = Math.PI / 2.5;
        }
        // Intentionally not calling onModelLoaded for "no model" state to avoid toasts
        // Or, if a "model cleared" toast is desired, call it here.
        // For now, let's assume no toast for clearing.
        return;
    }

    const isDataUrl = modelUrl.startsWith('data:');
    const rootUrl = isDataUrl ? "" : modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
    const pluginHint = modelFileExtension || undefined; // Use file extension directly as hint

    SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl, scene, undefined, pluginHint)
      .then(container => {
        loadedAssetContainerRef.current = container;
        container.addAllToScene();
        
        if (container.meshes.length > 0 && scene.activeCamera) {
          const camera = scene.activeCamera as ArcRotateCamera;
          let min = new Vector3(Infinity, Infinity, Infinity);
          let max = new Vector3(-Infinity, -Infinity, -Infinity);

          container.meshes.forEach((mesh: AbstractMesh) => {
            mesh.computeWorldMatrix(true); 
            const boundingInfo = mesh.getBoundingInfo();
            if (boundingInfo) {
              const meshMin = boundingInfo.boundingBox.minimumWorld;
              const meshMax = boundingInfo.boundingBox.maximumWorld;
              min = Vector3.Minimize(min, meshMin);
              max = Vector3.Maximize(max, meshMax);
            }
          });
          
          if (min.x !== Infinity) { 
            const center = Vector3.Center(min, max);
            camera.setTarget(center);
            const distance = Vector3.Distance(min, max);
            camera.radius = Math.max(distance * 1.5, 1); 
          } else {
             camera.setTarget(Vector3.Zero());
             camera.radius = 10;
          }
        }
        onModelLoaded(true); // THIS IS THE SUCCESS TOAST
        setIsCurrentModelActuallyLoaded(true); // Signal that model is loaded
      })
      .catch(error => {
        console.error("Error loading model:", error);
        let userMessage = "Unknown error during model loading.";
        if (error.message) {
            userMessage = error.message;
        } else if (typeof error === 'string') {
            userMessage = error;
        }
        if (modelFileExtension === '.obj' && isDataUrl) {
             userMessage += " For OBJ files loaded from local disk, .mtl files and textures are typically not packaged within the .obj data URI and may not load. Consider using GLB format for self-contained models.";
        } else if (modelFileExtension === '.obj' && !isDataUrl) {
             userMessage += " For OBJ files from a URL, ensure any .mtl material files and textures are accessible (usually in the same directory or correctly referenced).";
        }
        onModelLoaded(false, userMessage);
        setIsCurrentModelActuallyLoaded(false);
        if (loadedAssetContainerRef.current) { // Clean up if partially loaded
            loadedAssetContainerRef.current.dispose();
            loadedAssetContainerRef.current = null;
        }
      });

  }, [modelUrl, modelFileExtension, onModelLoaded, sceneRef]); // Dependencies ONLY related to *what* model to load and reporting.

  // Effect to apply rendering mode style (when mode changes OR when a new model just finished loading)
  useEffect(() => {
    if (isCurrentModelActuallyLoaded && loadedAssetContainerRef.current) {
      applyRenderingModeStyle(renderingMode, loadedAssetContainerRef.current);
    }
  }, [renderingMode, isCurrentModelActuallyLoaded, applyRenderingModeStyle]); // Depends on mode and load status

  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};
