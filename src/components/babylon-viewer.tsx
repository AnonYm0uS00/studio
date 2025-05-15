
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
  MultiMaterial,
  Node, // Import Node
  TransformNode, // Import TransformNode
  Mesh // Import Mesh for instanceof checks
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials';
import '@babylonjs/loaders/glTF'; 
import '@babylonjs/loaders/OBJ';  
import type { ModelNode } from './types';

export type RenderingMode = 'shaded' | 'non-shaded' | 'wireframe';

interface BabylonViewerProps {
  modelUrl: string | null;
  modelFileExtension: string | null; 
  onModelLoaded: (success: boolean, error?: string) => void;
  onCameraReady: (camera: ArcRotateCamera) => void;
  onFpsUpdate?: (fps: number) => void;
  renderingMode: RenderingMode;
  onModelHierarchyReady?: (hierarchy: ModelNode[]) => void;
}

export const BabylonViewer: React.FC<BabylonViewerProps> = ({ 
  modelUrl, 
  modelFileExtension, 
  onModelLoaded, 
  onCameraReady,
  onFpsUpdate,
  renderingMode,
  onModelHierarchyReady
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Nullable<Engine>>(null);
  const sceneRef = useRef<Nullable<Scene>>(null);
  const loadedAssetContainerRef = useRef<Nullable<AssetContainer>>(null);
  const [isCurrentModelActuallyLoaded, setIsCurrentModelActuallyLoaded] = useState(false);

  const applyRenderingModeStyle = useCallback((mode: RenderingMode, container: Nullable<AssetContainer>) => {
    if (!container || !sceneRef.current) return;

    container.meshes.forEach((mesh: AbstractMesh) => {
      if (mesh.name === "grid") { // Explicitly skip the grid mesh
        return;
      }

      if (mesh.material) {
        const processMaterial = (mat: Material) => {
          // Defaults for 'shaded'
          mat.wireframe = false;
          if (mat instanceof PBRMaterial) {
            mat.unlit = false; 
          } else if (mat instanceof StandardMaterial) {
            mat.disableLighting = false;
          }

          // Apply specific mode
          if (mode === 'wireframe') {
            mat.wireframe = true;
          } else if (mode === 'non-shaded') {
            if (mat instanceof PBRMaterial) {
              mat.unlit = true;
            } else if (mat instanceof StandardMaterial) {
              mat.disableLighting = true;
            }
          }
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
  }, [sceneRef]);

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
    gridMaterial.mainColor = Color3.FromHexString("#545454"); // Area between lines - made lighter
    gridMaterial.lineColor = Color3.FromHexString("#5F5F5F"); // Major grid lines - made lighter
    gridMaterial.opacity = 0.98;
    gridMaterial.useMaxLine = true;
    ground.material = gridMaterial;
    ground.isPickable = false;
    ground.position.y = 0; // Ensure grid is at y=0

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
    if (canvasRef.current) {
        resizeObserver.observe(canvasRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (sceneRef.current) {
        // Dispose of meshes and materials created in this effect
        const gridMesh = sceneRef.current.getMeshByName("grid");
        if (gridMesh) {
            gridMesh.dispose(false, true); // Dispose mesh and its material
        }
        sceneRef.current.dispose(); 
        sceneRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
    };
  }, [onCameraReady, onFpsUpdate]); 

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene || !onModelLoaded) return; 

    setIsCurrentModelActuallyLoaded(false);
    if (onModelHierarchyReady) onModelHierarchyReady([]);

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
        // Ensure grid is visible even if no model is loaded
        const grid = scene.getMeshByName("grid");
        if (grid) grid.setEnabled(true);
        return;
    }

    const isDataUrl = modelUrl.startsWith('data:');
    const rootUrl = isDataUrl ? "" : modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
    const pluginExtension = modelFileExtension || undefined; 

    // Hide grid while loading new model to avoid flicker if model is large
    const gridMesh = scene.getMeshByName("grid");
    if (gridMesh) gridMesh.setEnabled(false);


    SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl, scene, undefined, pluginExtension)
      .then(container => {
        loadedAssetContainerRef.current = container;
        container.addAllToScene();
        if (gridMesh) gridMesh.setEnabled(true); // Show grid again
        
        if (container.meshes.length > 0 && scene.activeCamera) {
          const camera = scene.activeCamera as ArcRotateCamera;
          // Calculate bounding box of the loaded model
          let min = new Vector3(Infinity, Infinity, Infinity);
          let max = new Vector3(-Infinity, -Infinity, -Infinity);

          container.meshes.forEach((mesh: AbstractMesh) => {
            // Ensure world matrix is computed for accurate bounding info
            mesh.computeWorldMatrix(true); 
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

            const modelSize = Vector3.Distance(min, max);
            camera.radius = Math.max(modelSize * 1.2, 1); // Ensure radius is not too small
            if (camera.radius === 0) camera.radius = 10; // Fallback if size is 0
            
            // Adjust grid position to be slightly below the model's lowest point if model is not at y=0
            const ground = scene.getMeshByName("grid");
            if(ground) {
                ground.position.y = min.y - 0.01; // Place grid slightly below the model
            }

          } else {
             // Fallback if model has no clear bounds (e.g. empty GLTF)
             camera.setTarget(Vector3.Zero());
             camera.radius = 10;
             const ground = scene.getMeshByName("grid");
             if (ground) ground.position.y = 0; // Reset grid to origin
          }
        }
        onModelLoaded(true);
        setIsCurrentModelActuallyLoaded(true); 

        if (onModelHierarchyReady) {
          const buildNodeHierarchy = (babylonNode: Node): ModelNode => {
            let nodeType = "Node";
            if (babylonNode instanceof Mesh) nodeType = "Mesh";
            else if (babylonNode instanceof TransformNode) nodeType = "TransformNode";
        
            const children = (babylonNode.getChildren ? babylonNode.getChildren() : [])
                .filter(child => 
                    child.getScene() === scene && 
                    !(child instanceof HemisphericLight) && 
                    !(child instanceof ArcRotateCamera) && 
                    child.name !== "grid" &&
                    !(child.name.startsWith("__") && child.name.endsWith("__")) // Filter out typical root nodes from GLTF
                ) 
                .map(buildNodeHierarchy);
        
            return {
              id: babylonNode.uniqueId.toString(),
              name: babylonNode.name || `Unnamed ${nodeType}`,
              type: nodeType,
              children: children,
            };
          };
        
          const hierarchyRoots: ModelNode[] = container.rootNodes
            .filter(node => 
                node.name !== "grid" && 
                node.name !== "camera" && 
                !node.name.startsWith("light") && 
                !(node.name.startsWith("__") && node.name.endsWith("__")) && // Common for internal/root nodes of GLTF
                !(node instanceof HemisphericLight) &&
                !(node instanceof ArcRotateCamera)
            )
            .map(buildNodeHierarchy);
        
          onModelHierarchyReady(hierarchyRoots);
        }


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
        if (gridMesh) gridMesh.setEnabled(true); // Show grid again even if model fails
        if (loadedAssetContainerRef.current) { // Ensure previous container is disposed if new load fails
            loadedAssetContainerRef.current.dispose();
            loadedAssetContainerRef.current = null;
        }
      });

  }, [modelUrl, modelFileExtension, onModelLoaded, sceneRef, onModelHierarchyReady]); 

  useEffect(() => {
    if (isCurrentModelActuallyLoaded && loadedAssetContainerRef.current) {
      applyRenderingModeStyle(renderingMode, loadedAssetContainerRef.current);
    }
  }, [renderingMode, isCurrentModelActuallyLoaded, applyRenderingModeStyle]); 

  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};

