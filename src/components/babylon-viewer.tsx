
'use client';
import React, { useEffect, useRef } from 'react';
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
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials';
import '@babylonjs/loaders/glTF'; // For GLTF/GLB support
import '@babylonjs/loaders/OBJ';  // For OBJ support


interface BabylonViewerProps {
  modelUrl: string | null;
  modelFileExtension: string | null; 
  onModelLoaded: (success: boolean, error?: string) => void;
  onCameraReady: (camera: ArcRotateCamera) => void;
  onFpsUpdate?: (fps: number) => void;
}

export const BabylonViewer: React.FC<BabylonViewerProps> = ({ 
  modelUrl, 
  modelFileExtension, 
  onModelLoaded, 
  onCameraReady,
  onFpsUpdate 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Nullable<Engine>>(null);
  const sceneRef = useRef<Nullable<Scene>>(null);
  const loadedAssetContainerRef = useRef<Nullable<AssetContainer>>(null);

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
    camera.upperRadiusLimit = 1000; // Keep upper limit high for user zoom out flexibility
    onCameraReady(camera);

    new HemisphericLight("light1", new Vector3(1, 1, 0), scene);
    new HemisphericLight("light2", new Vector3(-1, -1, -0.5), scene);

    // Create grid
    // Reduced size from 1000x1000 to 100x100, and subdivisions from 100 to 10
    const ground = MeshBuilder.CreateGround("grid", {width: 100, height: 100, subdivisions: 10}, scene);
    const gridMaterial = new GridMaterial("gridMaterial", scene);
    gridMaterial.majorUnitFrequency = 10; // Every 10 units (relative to gridRatio)
    gridMaterial.minorUnitVisibility = 0.45; // How visible minor lines are
    gridMaterial.gridRatio = 1; // Size of each grid cell
    gridMaterial.mainColor = Color3.FromHexString("#333333"); // Color of the grid plane (between lines)
    gridMaterial.lineColor = Color3.FromHexString("#595959"); // Color of the major grid lines
    gridMaterial.opacity = 0.98; // Slightly transparent
    gridMaterial.useMaxLine = true; // Emphasize main X/Z axis lines
    ground.material = gridMaterial;
    ground.isPickable = false;
    ground.position.y = 0; // Ensure grid is at the base


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
      // scene.dispose will also dispose meshes and materials like ground and gridMaterial
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
  }, [onCameraReady, onFpsUpdate]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (loadedAssetContainerRef.current) {
      loadedAssetContainerRef.current.dispose();
      loadedAssetContainerRef.current = null;
    }
    
    if (!modelUrl) {
        const camera = scene.activeCamera as ArcRotateCamera;
        if (camera) {
            camera.target = Vector3.Zero();
            camera.radius = 10; // Default radius when no model
            camera.alpha = -Math.PI / 2;
            camera.beta = Math.PI / 2.5;
        }
        onModelLoaded(true, undefined); 
        return;
    }

    const isDataUrl = modelUrl.startsWith('data:');
    const rootUrl = isDataUrl ? "" : modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
    
    const pluginHint = isDataUrl ? (modelFileExtension || undefined) : undefined;

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
            camera.radius = Math.max(distance * 1.5, 1); // Adjust radius based on model size
          } else {
             // Fallback if model has no clear bounds (e.g. empty GLTF)
             camera.setTarget(Vector3.Zero());
             camera.radius = 10;
          }
        }
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
        if (modelFileExtension === '.obj' && isDataUrl) {
             userMessage += " For OBJ files loaded from local disk, .mtl files and textures are typically not packaged within the .obj data URI and may not load. Consider using GLB format for self-contained models.";
        } else if (modelFileExtension === '.obj' && !isDataUrl) {
             userMessage += " For OBJ files from a URL, ensure any .mtl material files and textures are accessible (usually in the same directory or correctly referenced).";
        }


        onModelLoaded(false, userMessage);
      });

  }, [modelUrl, modelFileExtension, onModelLoaded, sceneRef]);

  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};
    