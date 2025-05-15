
'use client';
import React, { useEffect, useRef, useCallback } from 'react';
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

  const applyRenderingModeStyle = useCallback((mode: RenderingMode, container: Nullable<AssetContainer>) => {
    if (!container || !sceneRef.current) return;

    container.meshes.forEach((mesh: AbstractMesh) => {
      if (mesh.material) {
        const processMaterial = (mat: Material) => {
          // General resets
          mat.wireframe = false;
          
          // Material type specific resets
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
  }, [sceneRef]); // sceneRef is stable, this callback is created once


  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
    engineRef.current = engine;
    const scene = new Scene(engine);
    sceneRef.current = scene;
    
    scene.clearColor = new Color4(0, 0, 0, 0); // Transparent background for canvas

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
    gridMaterial.mainColor = Color3.FromHexString("#333333"); // Dark gray (Maya-like)
    gridMaterial.lineColor = Color3.FromHexString("#595959"); // Mid-gray (Maya-like)
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
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      if (loadedAssetContainerRef.current) {
        loadedAssetContainerRef.current.dispose();
        loadedAssetContainerRef.current = null;
      }
    };
  }, [onCameraReady, onFpsUpdate]); // Only depends on callbacks that should be stable

  // Effect for loading models
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Dispose previous model if any
    if (loadedAssetContainerRef.current) {
      loadedAssetContainerRef.current.dispose();
      loadedAssetContainerRef.current = null;
    }
    
    if (!modelUrl) {
        const camera = scene.activeCamera as ArcRotateCamera;
        if (camera) {
            // Reset camera for empty scene
            camera.target = Vector3.Zero();
            camera.radius = 10; // Default radius
            camera.alpha = -Math.PI / 2;
            camera.beta = Math.PI / 2.5;
        }
        onModelLoaded(true, undefined); // Indicate model "unloaded" successfully
        return;
    }

    const isDataUrl = modelUrl.startsWith('data:');
    const rootUrl = isDataUrl ? "" : modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
    // Use modelFileExtension as pluginHint for data URLs, otherwise undefined for http(s) URLs
    const pluginHint = isDataUrl ? (modelFileExtension || undefined) : undefined;

    SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl, scene, undefined, pluginHint)
      .then(container => {
        loadedAssetContainerRef.current = container;
        container.addAllToScene();
        
        // Auto-focus camera on the loaded model
        if (container.meshes.length > 0 && scene.activeCamera) {
          const camera = scene.activeCamera as ArcRotateCamera;
          let min = new Vector3(Infinity, Infinity, Infinity);
          let max = new Vector3(-Infinity, -Infinity, -Infinity);

          container.meshes.forEach((mesh: AbstractMesh) => {
            mesh.computeWorldMatrix(true); // Ensure world matrix is up to date
            const boundingInfo = mesh.getBoundingInfo();
            if (boundingInfo) {
              const meshMin = boundingInfo.boundingBox.minimumWorld;
              const meshMax = boundingInfo.boundingBox.maximumWorld;
              min = Vector3.Minimize(min, meshMin);
              max = Vector3.Maximize(max, meshMax);
            }
          });
          
          if (min.x !== Infinity) { // Check if any bounds were actually computed
            const center = Vector3.Center(min, max);
            camera.setTarget(center);
            const distance = Vector3.Distance(min, max);
            camera.radius = Math.max(distance * 1.5, 1); // Ensure radius is not too small
          } else {
             // Fallback if no valid bounding info (e.g., empty model)
             camera.setTarget(Vector3.Zero());
             camera.radius = 10;
          }
        }
        // Apply the current rendering mode to the newly loaded model
        applyRenderingModeStyle(renderingMode, container);
        onModelLoaded(true);
      })
      .catch(error => {
        console.error("Error loading model:", error);
        let userMessage = "Unknown error during model loading.";
        if (error.message) {
            userMessage = error.message;
        } else if (typeof error === 'string') {
            userMessage = error;
        }
        // Specific advice for OBJ data URLs
        if (modelFileExtension === '.obj' && isDataUrl) {
             userMessage += " For OBJ files loaded from local disk, .mtl files and textures are typically not packaged within the .obj data URI and may not load. Consider using GLB format for self-contained models.";
        } else if (modelFileExtension === '.obj' && !isDataUrl) {
             userMessage += " For OBJ files from a URL, ensure any .mtl material files and textures are accessible (usually in the same directory or correctly referenced).";
        }
        onModelLoaded(false, userMessage);
      });

  }, [modelUrl, modelFileExtension, onModelLoaded, sceneRef, renderingMode, applyRenderingModeStyle]); // renderingMode and applyRenderingModeStyle are needed here to apply initial mode to new model. 
                                                                    // onModelLoaded is included as it's part of the loading process. sceneRef is for accessing the scene.

  // Effect to apply rendering mode when the prop changes for an already loaded model
  useEffect(() => {
    if (loadedAssetContainerRef.current) {
      applyRenderingModeStyle(renderingMode, loadedAssetContainerRef.current);
    }
  }, [renderingMode, applyRenderingModeStyle]); // Only depends on renderingMode and the memoized apply function


  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};
    
