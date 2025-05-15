
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
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials';
import '@babylonjs/loaders/glTF';
import '@babylonjs/loaders/OBJ';
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

  // Effect for scene clear color based on theme
  useEffect(() => {
    if (sceneRef.current) {
      if (effectiveTheme === 'light') {
        sceneRef.current.clearColor = new Color4(240/255, 240/255, 240/255, 1); // Light Gray
      } else { // dark
        sceneRef.current.clearColor = new Color4(38/255, 38/255, 38/255, 1); // Dark Gray
      }
    }
  }, [effectiveTheme, sceneRef]);

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
      // Visibility will be handled by the isGridVisible effect
    }

    if (scene.environmentTexture) {
        scene.environmentTexture.dispose();
        scene.environmentTexture = null;
    }
    const skyboxMesh = scene.getMeshByName("hdrSkyBox"); 
    if (skyboxMesh) skyboxMesh.dispose();
    
    scene.createDefaultEnvironment({ 
        createSkybox: false, 
        skyboxSize: 1000, 
        createGround: false 
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
    camera.upperRadiusLimit = 5000; 
    onCameraReady(camera);
    
    if (sceneRef.current.environmentTexture) {
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
        if (gridMesh) gridMesh.dispose(false, true); 
        
        const skybox = sceneRef.current.getMeshByName("hdrSkyBox"); 
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
    const activeCamera = sceneRef.current?.activeCamera;
    if (activeCamera) {
      activeCamera.minZ = nearClip;
      activeCamera.maxZ = farClip;
    }
  }, [nearClip, farClip]);


  useEffect(() => {
    const scene = sceneRef.current;
    const camera = scene?.activeCamera as Nullable<ArcRotateCamera>;

    if (!scene || !camera || !onModelLoaded) return;

    setIsCurrentModelActuallyLoaded(false); 
    if (onModelHierarchyReady) onModelHierarchyReady([]);

    if (loadedAssetContainerRef.current) {
      loadedAssetContainerRef.current.dispose();
      loadedAssetContainerRef.current = null;
    }
    
    const grid = scene.getMeshByName("grid");

    if (!modelUrl) {
        internalResetCameraAndEnvironment();
        if (grid) grid.position.y = 0; // Reset grid position if no model
        return;
    }

    const isDataUrl = modelUrl.startsWith('data:');
    const rootUrl = isDataUrl ? "" : modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
    const pluginExtension = modelFileExtension || undefined;


    SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl, scene, undefined, pluginExtension)
      .then(container => {
        loadedAssetContainerRef.current = container;
        container.addAllToScene();

        const allModelMeshes = container.meshes.filter(m => m.name !== "grid");
        let modelSize = 10; 

        if (allModelMeshes.length > 0) {
            const visibleEnabledMeshes = allModelMeshes.filter(m => m.isVisible && m.isEnabled());

            if (visibleEnabledMeshes.length > 0) {
                visibleEnabledMeshes.forEach(mesh => mesh.computeWorldMatrix(true));
                camera.zoomOn(visibleEnabledMeshes, true); 

                let min = new Vector3(Infinity, Infinity, Infinity);
                let max = new Vector3(-Infinity, -Infinity, -Infinity);
                visibleEnabledMeshes.forEach((meshNode: AbstractMesh) => { 
                    const boundingInfo = meshNode.getBoundingInfo();
                    if (boundingInfo) {
                        min = Vector3.Minimize(min, boundingInfo.boundingBox.minimumWorld);
                        max = Vector3.Maximize(max, boundingInfo.boundingBox.maximumWorld);
                    }
                });

                if (min.x !== Infinity) { 
                    modelSize = Vector3.Distance(min, max);
                    if(grid) {
                        grid.position.y = min.y - 0.01; 
                    }
                } else { 
                    internalResetCameraAndEnvironment();
                    if(grid) grid.position.y = 0;
                }
            } else { 
                internalResetCameraAndEnvironment();
                if(grid) grid.position.y = 0;
            }
        } else { 
            internalResetCameraAndEnvironment();
            if(grid) grid.position.y = 0;
        }

        if (scene.environmentTexture) {
            scene.environmentTexture.dispose();
            scene.environmentTexture = null;
        }
        const existingSkyboxMesh = scene.getMeshByName("hdrSkyBox"); 
        if (existingSkyboxMesh) existingSkyboxMesh.dispose();

        scene.createDefaultEnvironment({
            createSkybox: false, 
            skyboxSize: Math.max(modelSize * 2, 1000), 
            createGround: false,
        });

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
                    !child.name.startsWith("hdrSkyBox") && 
                    !(child.name.startsWith("__") && child.name.endsWith("__")) 
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
                !node.name.startsWith("hdrSkyBox") && 
                !(node.name.startsWith("__") && node.name.endsWith("__")) &&
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
        if (grid) grid.position.y = 0; 
        if (loadedAssetContainerRef.current) { 
            loadedAssetContainerRef.current.dispose();
            loadedAssetContainerRef.current = null;
        }
        internalResetCameraAndEnvironment();
      });

  }, [
    modelUrl, 
    modelFileExtension, 
    onModelLoaded, 
    sceneRef, 
    onModelHierarchyReady, 
    internalResetCameraAndEnvironment
  ]);

  useEffect(() => {
    if (sceneRef.current) {
      const gridMesh = sceneRef.current.getMeshByName("grid");
      if (gridMesh) {
        gridMesh.setEnabled(isGridVisible);
      }
    }
  }, [isGridVisible, sceneRef]); // Re-run when isGridVisible changes or scene is ready
  
  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};
