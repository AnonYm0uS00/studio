
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
  Mesh,
  // EdgesRenderer, // Removed as per previous request
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials';
import '@babylonjs/loaders/glTF';
import '@babylonjs/loaders/OBJ';
// STL loader removed

import type { ModelNode } from './types';

export type RenderingMode = 'shaded' | 'non-shaded' | 'wireframe';
type EffectiveTheme = 'light' | 'dark';

interface BabylonViewerProps {
  modelUrl: string | null;
  modelFileExtension: string | null;
  onModelLoaded: (success: boolean, error?: string) => void;
  onCameraReady: (camera: ArcRotateCamera) => void;
  onFpsUpdate?: (fps: number) => void;
  onModelHierarchyReady?: (hierarchy: ModelNode[]) => void;
  renderingMode: RenderingMode;
  nearClip: number;
  farClip: number;
  effectiveTheme: EffectiveTheme;
  isGridVisible: boolean;
}

export const BabylonViewer: React.FC<BabylonViewerProps> = ({
  modelUrl,
  modelFileExtension,
  onModelLoaded,
  onCameraReady,
  onFpsUpdate,
  onModelHierarchyReady,
  renderingMode,
  nearClip,
  farClip,
  effectiveTheme,
  isGridVisible,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Nullable<Engine>>(null);
  const sceneRef = useRef<Nullable<Scene>>(null);
  const loadedAssetContainerRef = useRef<Nullable<AssetContainer>>(null);
  const [isCurrentModelActuallyLoaded, setIsCurrentModelActuallyLoaded] = useState(false);

  const internalResetCameraAndEnvironment = useCallback(() => {
    const scene = sceneRef.current;
    const camera = scene?.activeCamera as Nullable<ArcRotateCamera>;
    if (!scene || !camera) return;

    camera.setTarget(Vector3.Zero());
    camera.radius = 10;
    camera.alpha = -Math.PI / 2;
    camera.beta = Math.PI / 2.5;
    
    const groundMesh = scene.getMeshByName("grid");
    if(groundMesh) {
      groundMesh.position.y = 0; // Reset grid position
    }

    // Dispose existing environment if any
    if (scene.environmentTexture) {
        scene.environmentTexture.dispose();
        scene.environmentTexture = null;
    }
    const skyboxMesh = scene.getMeshByName("hdrSkyBox"); // Default name for skybox mesh
    if (skyboxMesh) skyboxMesh.dispose();

    scene.createDefaultEnvironment({
        createSkybox: false, // We don't want the visual skybox, just IBL
        skyboxSize: 1000, // Default size, might be overridden later
        createGround: false // We handle our own grid
    });
  }, [sceneRef]);


  const applyRenderingModeStyle = useCallback((mode: RenderingMode, container: Nullable<AssetContainer>) => {
    if (!container || !sceneRef.current) return;

    const processMaterial = (mat: Nullable<Material>) => {
      if (!mat) return;

      // Default to shaded behavior (phase 1: reset)
      mat.wireframe = false;
      if (mat instanceof PBRMaterial) {
        mat.unlit = false;
      } else if (mat instanceof StandardMaterial) {
        mat.disableLighting = false;
      }

      // Apply selected mode (phase 2: apply specific mode)
      if (mode === 'non-shaded') {
        if (mat instanceof PBRMaterial) {
          mat.unlit = true;
        } else if (mat instanceof StandardMaterial) {
          mat.disableLighting = true;
        }
        // For other material types, non-shaded might not have a direct equivalent,
        // so they effectively remain shaded (but wireframe is off).
      } else if (mode === 'wireframe') {
        mat.wireframe = true;
        // For a clearer "Wireframe" mode, also make the underlying material unlit/lighting disabled.
        if (mat instanceof PBRMaterial) {
          mat.unlit = true;
        } else if (mat instanceof StandardMaterial) {
          mat.disableLighting = true;
        }
      }
      // If mode is 'shaded', the defaults set in phase 1 have already handled it.
    };

    container.meshes.forEach((mesh: AbstractMesh) => {
      if (mesh.name === "grid") return; 

      if (mesh.material) {
        if (mesh.material instanceof MultiMaterial) {
          mesh.material.subMaterials.forEach(subMat => processMaterial(subMat));
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

    const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 2.5, 10, Vector3.Zero(), scene);
    camera.attachControl(canvasRef.current, true);
    camera.wheelPrecision = 50;
    camera.lowerRadiusLimit = 0.1;
    camera.upperRadiusLimit = 20000;
    onCameraReady(camera);
    
    // Initial default environment (no visual skybox)
    if (sceneRef.current.environmentTexture) { // Clean up if any stale one exists
        sceneRef.current.environmentTexture.dispose();
        sceneRef.current.environmentTexture = null;
    }
    sceneRef.current.createDefaultEnvironment({
        createSkybox: false, 
        skyboxSize: 1000,
        createGround: false,
    });


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
    ground.position.y = 0; // Default position

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
        if (gridMesh) gridMesh.dispose(false, true); // Dispose material and geometry
        
        const skybox = sceneRef.current.getMeshByName("hdrSkyBox"); // Default name from createDefaultEnvironment
        if (skybox) skybox.dispose();
        if (sceneRef.current.environmentTexture) {
            sceneRef.current.environmentTexture.dispose();
            sceneRef.current.environmentTexture = null;
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
    if (sceneRef.current) {
      if (effectiveTheme === 'light') {
        sceneRef.current.clearColor = new Color4(240/255, 240/255, 240/255, 1); // Light gray
      } else { // dark
        sceneRef.current.clearColor = new Color4(38/255, 38/255, 38/255, 1); // Dark gray (matching UI theme)
      }
    }
  }, [effectiveTheme, sceneRef]);

  useEffect(() => {
    const activeCamera = sceneRef.current?.activeCamera;
    if (activeCamera) {
      activeCamera.minZ = nearClip;
      activeCamera.maxZ = farClip;
    }
  }, [nearClip, farClip, sceneRef]);


  useEffect(() => {
    const scene = sceneRef.current;
    const camera = scene?.activeCamera as Nullable<ArcRotateCamera>;

    if (!scene || !camera || !onModelLoaded) return;

    setIsCurrentModelActuallyLoaded(false); // Reset flag for new model
    if (onModelHierarchyReady) onModelHierarchyReady([]);


    // Dispose previous model's asset container if it exists
    if (loadedAssetContainerRef.current) {
      loadedAssetContainerRef.current.removeAllFromScene(); // Removes meshes, lights, cameras etc. from container
      loadedAssetContainerRef.current.dispose(); // Disposes assets in the container
      loadedAssetContainerRef.current = null;
    }
    
    const grid = scene.getMeshByName("grid");

    if (!modelUrl) {
        internalResetCameraAndEnvironment(); // Reset camera and default env
        if (grid) grid.position.y = 0; // Ensure grid is at origin if no model
        // No model to load, so callback indicates no success (or handle as appropriate)
        // onModelLoaded(false, "No model URL provided."); // Optionally signal this
        return;
    }

    const isDataUrl = modelUrl.startsWith('data:');
    const rootUrl = isDataUrl ? "" : modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
    const pluginExtension = isDataUrl ? modelFileExtension || undefined : undefined;


    SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl, scene, undefined, pluginExtension)
      .then(container => {
        loadedAssetContainerRef.current = container;
        container.addAllToScene();

        const allModelMeshes = container.meshes.filter(m => m.name !== "grid" && !(m instanceof HemisphericLight) && !(m instanceof ArcRotateCamera) && !m.name.startsWith("hdrSkyBox") && !(m.name.startsWith("__") && m.name.endsWith("__")));
        let modelSize = 10; // Default model size for environment scaling

        if (allModelMeshes.length > 0) {
            // Filter for meshes that are actually visible and enabled for zooming
            const visibleEnabledMeshes = allModelMeshes.filter(m => m.isVisible && m.isEnabled());

            if (visibleEnabledMeshes.length > 0) {
                // It's good practice to compute world matrix before zoomOn if meshes were just added/transformed
                visibleEnabledMeshes.forEach(mesh => mesh.computeWorldMatrix(true)); 
                camera.zoomOn(visibleEnabledMeshes, true); // true to use bounding box center

                // After zoomOn, camera.target and camera.radius are updated.
                // Now, calculate the actual min/max bounds of the model for grid positioning and env scaling.
                let min = new Vector3(Infinity, Infinity, Infinity);
                let max = new Vector3(-Infinity, -Infinity, -Infinity);
                visibleEnabledMeshes.forEach((meshNode: AbstractMesh) => {
                    const boundingInfo = meshNode.getBoundingInfo(); // Ensure bounding info is up-to-date
                    if (boundingInfo) {
                        min = Vector3.Minimize(min, boundingInfo.boundingBox.minimumWorld);
                        max = Vector3.Maximize(max, boundingInfo.boundingBox.maximumWorld);
                    }
                });

                if (min.x !== Infinity) { // Check if bounds were actually updated
                    modelSize = Vector3.Distance(min, max);
                    if(grid) {
                        grid.position.y = min.y - 0.01; // Position grid just below the model
                    }
                } else {
                    // No valid bounds, reset camera and grid
                    internalResetCameraAndEnvironment();
                    if(grid) grid.position.y = 0;
                }
            } else {
                // No visible/enabled meshes, model might be empty or all parts hidden
                internalResetCameraAndEnvironment();
                 if(grid) grid.position.y = 0;
            }
        } else {
            // Model has no meshes
            internalResetCameraAndEnvironment();
            if(grid) grid.position.y = 0;
        }
        
        // Recreate/update default environment for the new model scale if necessary
        if (scene.environmentTexture) { // Dispose old one
            scene.environmentTexture.dispose();
            scene.environmentTexture = null;
        }
        const existingSkyboxMesh = scene.getMeshByName("hdrSkyBox"); // Babylon's default name
        if (existingSkyboxMesh) existingSkyboxMesh.dispose();

        scene.createDefaultEnvironment({
            createSkybox: false, // Still no visual skybox
            skyboxSize: Math.max(modelSize * 2, 2000), // Dynamically size IBL based on model
            createGround: false, // We handle our own grid
        });
        
        onModelLoaded(true);
        setIsCurrentModelActuallyLoaded(true); // Set this before calling applyRenderingModeStyle potentially via useEffect

        if (onModelHierarchyReady) {
          const buildNodeHierarchy = (babylonNode: Node): ModelNode => {
            let nodeType = "Node";
            if (babylonNode instanceof Mesh) nodeType = "Mesh";
            else if (babylonNode instanceof TransformNode) nodeType = "TransformNode";
        
            // Filter children: exclude scene helpers and also __root__ if it has no other meaning
            const children = (babylonNode.getChildren ? babylonNode.getChildren() : [])
                .filter(child => // Filter out scene helpers from children traversal
                    child.getScene() === scene && // ensure it's from the current scene
                    child.name !== "camera" && // our camera
                    !child.name.startsWith("light1") && // our light
                    !child.name.startsWith("light2") && // our light
                    child.name !== "grid" && // our grid
                    !child.name.startsWith("hdrSkyBox") && // default env skybox
                    !(child instanceof HemisphericLight) && // any other lights
                    !(child instanceof ArcRotateCamera)  // any other cameras
                )
                .map(buildNodeHierarchy);
        
            return {
              id: babylonNode.uniqueId.toString(),
              name: babylonNode.name || `Unnamed ${nodeType}`,
              type: nodeType,
              children: children,
            };
          };
        
          // Build hierarchy from root nodes of the loaded container
          // Filter root nodes to exclude only specific scene helper objects
          const hierarchyRoots: ModelNode[] = container.rootNodes
            .filter(node =>
                node.name !== "grid" &&
                node.name !== "camera" && 
                !node.name.startsWith("light1") && // specific name for our light
                !node.name.startsWith("light2") && // specific name for our light
                !node.name.startsWith("hdrSkyBox") &&
                !(node instanceof HemisphericLight) && // type check for any other lights
                !(node instanceof ArcRotateCamera)  // type check for any other cameras
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
        // Specific advice for OBJ if it's a data URL, as MTLs are often an issue
        if (modelFileExtension && ['.obj'].includes(modelFileExtension) && isDataUrl) {
             userMessage += ` For ${modelFileExtension.toUpperCase()} files loaded from local disk, any associated material files (like .mtl) or external textures are typically not packaged within the data URI and may not load. Consider using GLB format for self-contained models.`;
        } else if (modelFileExtension && ['.obj'].includes(modelFileExtension) && !isDataUrl) {
             userMessage += ` For ${modelFileExtension.toUpperCase()} files from a URL, ensure any associated material files and textures are accessible (usually in the same directory or correctly referenced).`;
        }

        onModelLoaded(false, userMessage);
        setIsCurrentModelActuallyLoaded(false);
        if (grid) grid.position.y = 0; // Reset grid position on error
        // Clean up any partially loaded container if error occurs mid-process
        if (loadedAssetContainerRef.current) { // Should be null if LoadAssetContainerAsync fails early
            loadedAssetContainerRef.current.removeAllFromScene();
            loadedAssetContainerRef.current.dispose();
            loadedAssetContainerRef.current = null;
        }
        internalResetCameraAndEnvironment(); // Reset camera to default on error
      });

  }, [
    modelUrl,
    modelFileExtension,
    onModelLoaded,
    onModelHierarchyReady,
    internalResetCameraAndEnvironment, // internalResetCameraAndEnvironment is stable
    sceneRef // sceneRef.current could change if the whole component re-mounts
    // cameraRef is managed internally and not a prop, so not needed here
  ]);

  // Effect to apply rendering mode styles when mode changes OR when a new model is confirmed loaded
  useEffect(() => {
    if (isCurrentModelActuallyLoaded && loadedAssetContainerRef.current) {
      applyRenderingModeStyle(renderingMode, loadedAssetContainerRef.current);
    }
  }, [renderingMode, isCurrentModelActuallyLoaded, applyRenderingModeStyle]);


  // Effect to toggle grid visibility
  useEffect(() => {
    if (sceneRef.current) {
      const gridMesh = sceneRef.current.getMeshByName("grid");
      if (gridMesh) {
        gridMesh.setEnabled(isGridVisible);
      }
    }
  }, [isGridVisible, sceneRef]);


  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};

