
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
  Node,
  TransformNode,
  Mesh
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
  wireframeOverlayEnabled?: boolean;
}

export const BabylonViewer: React.FC<BabylonViewerProps> = ({
  modelUrl,
  modelFileExtension,
  onModelLoaded,
  onCameraReady,
  onFpsUpdate,
  renderingMode,
  onModelHierarchyReady,
  wireframeOverlayEnabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Nullable<Engine>>(null);
  const sceneRef = useRef<Nullable<Scene>>(null);
  const loadedAssetContainerRef = useRef<Nullable<AssetContainer>>(null);
  const [isCurrentModelActuallyLoaded, setIsCurrentModelActuallyLoaded] = useState(false);

  const toggleWireframeEdges = useCallback((container: Nullable<AssetContainer>, enabled: boolean) => {
    if (!container) return;
    container.meshes.forEach((mesh: AbstractMesh) => {
      if (mesh.name === "grid") return; // Skip grid

      if (enabled) {
        // Epsilon closer to 1 (e.g., 0.9999) shows edges between faces with smaller angle differences.
        // This helps to show more polygon lines, aiming for a full wireframe appearance.
        mesh.enableEdgesRendering(0.9999); 
        mesh.edgesWidth = 1.5; 
        mesh.edgesColor = Color4.FromColor3(Color3.FromHexString("#008080"), 1); // Teal, fully opaque
      } else {
        if (mesh.edgesRenderer) {
          mesh.edgesRenderer.isEnabled = false;
        }
      }
    });
  }, []);

  const applyRenderingModeStyle = useCallback((mode: RenderingMode, container: Nullable<AssetContainer>) => {
    if (!container || !sceneRef.current) return;

    container.meshes.forEach((mesh: AbstractMesh) => {
      if (mesh.name === "grid") { // Explicitly skip grid material changes
        return;
      }

      if (mesh.material) {
        const processMaterial = (mat: Material) => {
          mat.wireframe = false; // Reset wireframe
          if (mat instanceof PBRMaterial) {
            mat.unlit = false; // Reset unlit
          } else if (mat instanceof StandardMaterial) {
            mat.disableLighting = false; // Reset disableLighting
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
  }, [sceneRef]); // sceneRef is stable but included as it's accessed

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true });
    engineRef.current = engine;
    const scene = new Scene(engine);
    sceneRef.current = scene;

    scene.clearColor = new Color4(0, 0, 0, 0); // Transparent background for the canvas

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
    gridMaterial.mainColor = Color3.FromHexString("#545454"); 
    gridMaterial.lineColor = Color3.FromHexString("#5F5F5F"); 
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
    if (canvasRef.current) {
        resizeObserver.observe(canvasRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      if (sceneRef.current) {
        const gridMesh = sceneRef.current.getMeshByName("grid");
        if (gridMesh) {
            gridMesh.dispose(false, true); 
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

    setIsCurrentModelActuallyLoaded(false); // Reset flag for new model
    if (onModelHierarchyReady) onModelHierarchyReady([]);


    if (loadedAssetContainerRef.current) {
      // Dispose previous model's edges renderers first if they exist
      loadedAssetContainerRef.current.meshes.forEach(mesh => {
        if (mesh.edgesRenderer) {
          mesh.disableEdgesRendering(); // Ensure renderer is disabled before disposal
        }
      });
      loadedAssetContainerRef.current.dispose();
      loadedAssetContainerRef.current = null;
    }
    
    const grid = scene.getMeshByName("grid");

    if (!modelUrl) {
        const camera = scene.activeCamera as ArcRotateCamera;
        if (camera) {
            camera.target = Vector3.Zero();
            camera.radius = 10;
            camera.alpha = -Math.PI / 2;
            camera.beta = Math.PI / 2.5;
        }
        if (grid) grid.setEnabled(true);
        return;
    }

    const isDataUrl = modelUrl.startsWith('data:');
    const rootUrl = isDataUrl ? "" : modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
    const pluginExtension = isDataUrl ? modelFileExtension || undefined : undefined;

    if (grid) grid.setEnabled(false);


    SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl, scene, undefined, pluginExtension)
      .then(container => {
        loadedAssetContainerRef.current = container;
        container.addAllToScene();
        if (grid) grid.setEnabled(true);

        if (container.meshes.length > 0 && scene.activeCamera) {
          const camera = scene.activeCamera as ArcRotateCamera;
          let min = new Vector3(Infinity, Infinity, Infinity);
          let max = new Vector3(-Infinity, -Infinity, -Infinity);

          container.meshes.forEach((mesh: AbstractMesh) => {
            if (mesh.name === "grid") return;
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

            const modelSize = Vector3.Distance(min, max);
            camera.radius = Math.max(modelSize * 1.2, 1); 
            if(camera.radius === 0) camera.radius = 10; // safety net

            const groundMesh = scene.getMeshByName("grid");
            if(groundMesh) {
                groundMesh.position.y = min.y - 0.01; // Position grid slightly below the model
            }

          } else {
             camera.setTarget(Vector3.Zero());
             camera.radius = 10; 
             const groundMesh = scene.getMeshByName("grid");
             if(groundMesh) groundMesh.position.y = 0;
          }
        }
        onModelLoaded(true);
        setIsCurrentModelActuallyLoaded(true); // Set flag after successful load and setup

        if (onModelHierarchyReady) {
          const buildNodeHierarchy = (babylonNode: Node): ModelNode => {
            let nodeType = "Node";
            if (babylonNode instanceof Mesh) nodeType = "Mesh";
            else if (babylonNode instanceof TransformNode) nodeType = "TransformNode";
            
            const children = (babylonNode.getChildren ? babylonNode.getChildren() : [])
                .filter(child => 
                    child.getScene() === scene && // Ensure it's part of the main scene
                    !(child instanceof HemisphericLight) && 
                    !(child instanceof ArcRotateCamera) &&
                    child.name !== "grid" && // Exclude the grid
                    !(child.name.startsWith("__") && child.name.endsWith("__")) // Exclude Babylon internal nodes
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
                !(node.name.startsWith("__") && node.name.endsWith("__")) &&
                !(node instanceof HemisphericLight) && 
                !(node instanceof ArcRotateCamera)
            )
            .map(buildNodeHierarchy);
            
          onModelHierarchyReady(hierarchyRoots);
        }
        // Initial style application after model load
        applyRenderingModeStyle(renderingMode, loadedAssetContainerRef.current);
        toggleWireframeEdges(loadedAssetContainerRef.current, wireframeOverlayEnabled);

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
        if (grid) grid.setEnabled(true); // Re-enable grid on error
        if (loadedAssetContainerRef.current) { // Clean up failed load attempt
            loadedAssetContainerRef.current.dispose();
            loadedAssetContainerRef.current = null;
        }
      });

  }, [modelUrl, modelFileExtension, onModelLoaded, sceneRef, onModelHierarchyReady, renderingMode, wireframeOverlayEnabled, applyRenderingModeStyle, toggleWireframeEdges]);
  // Removed renderingMode, wireframeOverlayEnabled, applyRenderingModeStyle, toggleWireframeEdges from here
  // as they are handled by the effect below or applied once after load


  useEffect(() => {
    if (isCurrentModelActuallyLoaded && loadedAssetContainerRef.current) {
      applyRenderingModeStyle(renderingMode, loadedAssetContainerRef.current);
      // When rendering mode changes, ensure overlay is re-applied based on its current state
      toggleWireframeEdges(loadedAssetContainerRef.current, wireframeOverlayEnabled);
    }
  }, [renderingMode, isCurrentModelActuallyLoaded, applyRenderingModeStyle, wireframeOverlayEnabled, toggleWireframeEdges]);
  // This effect is for re-applying styles if renderingMode or wireframeOverlayEnabled props change *after* a model is loaded.
  // Adding wireframeOverlayEnabled and toggleWireframeEdges here.

  // No specific useEffect for only wireframeOverlayEnabled is needed if the above handles it.

  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};

