
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
  // CubeTexture, // Not currently used, but could be for custom skybox
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

const resetCameraAndEnvironment = (scene: Nullable<Scene>, camera: Nullable<ArcRotateCamera>) => {
  if (!scene || !camera) return;

  camera.setTarget(Vector3.Zero());
  camera.radius = 10;
  camera.alpha = -Math.PI / 2;
  camera.beta = Math.PI / 2.5;

  const groundMesh = scene.getMeshByName("grid");
  if(groundMesh) groundMesh.position.y = 0;

  if (scene.environmentTexture) {
      scene.environmentTexture.dispose();
      scene.environmentTexture = null; // Ensure it's fully cleared
  }
  const skybox = scene.getMeshByName("hdrSkyBox");
  if (skybox) skybox.dispose();
  
  scene.createDefaultEnvironment({ createSkybox: true, skyboxSize: 1000, createGround: false });
};


export const BabylonViewer: React.FC<BabylonViewerProps> = ({
  modelUrl,
  modelFileExtension,
  onModelLoaded,
  onCameraReady,
  onFpsUpdate,
  renderingMode,
  onModelHierarchyReady,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Nullable<Engine>>(null);
  const sceneRef = useRef<Nullable<Scene>>(null);
  const loadedAssetContainerRef = useRef<Nullable<AssetContainer>>(null);
  const [isCurrentModelActuallyLoaded, setIsCurrentModelActuallyLoaded] = useState(false);


  const applyRenderingModeStyle = useCallback((mode: RenderingMode) => {
    const container = loadedAssetContainerRef.current;
    if (!container || !sceneRef.current || !isCurrentModelActuallyLoaded) return;

    container.meshes.forEach((mesh: AbstractMesh) => {
      if (mesh.name === "grid") { 
        return;
      }

      if (mesh.material) {
        const processMaterial = (mat: Material) => {
          mat.wireframe = false; 
          if (mat instanceof PBRMaterial) {
            mat.unlit = false; 
          } else if (mat instanceof StandardMaterial) {
            mat.disableLighting = false; 
          }

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
  }, [sceneRef, isCurrentModelActuallyLoaded]);

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
    camera.upperRadiusLimit = 2000; // Increased upper limit
    onCameraReady(camera);
    
    scene.createDefaultEnvironment({
        createSkybox: true,
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
        if (gridMesh) {
            gridMesh.dispose(false, true); 
        }
        const skybox = sceneRef.current.getMeshByName("hdrSkyBox");
        if (skybox) skybox.dispose();
        if (sceneRef.current.environmentTexture) {
            sceneRef.current.environmentTexture.dispose();
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
        resetCameraAndEnvironment(scene, camera);
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

        const allModelMeshes = container.meshes.filter(m => m.name !== "grid");

        if (allModelMeshes.length > 0) {
            const visibleEnabledMeshes = allModelMeshes.filter(m => m.isVisible && m.isEnabled());

            if (visibleEnabledMeshes.length > 0) {
                visibleEnabledMeshes.forEach(mesh => mesh.computeWorldMatrix(true));
                camera.zoomOn(visibleEnabledMeshes, true); // true for framing behavior based on bounding box center

                let min = new Vector3(Infinity, Infinity, Infinity);
                let max = new Vector3(-Infinity, -Infinity, -Infinity);
                visibleEnabledMeshes.forEach((mesh: AbstractMesh) => {
                    const boundingInfo = mesh.getBoundingInfo();
                    if (boundingInfo) {
                        min = Vector3.Minimize(min, boundingInfo.boundingBox.minimumWorld);
                        max = Vector3.Maximize(max, boundingInfo.boundingBox.maximumWorld);
                    }
                });

                if (min.x !== Infinity) {
                    const modelSize = Vector3.Distance(min, max);
                    const groundMesh = scene.getMeshByName("grid");
                    if(groundMesh) {
                        groundMesh.position.y = min.y - 0.01;
                    }
                    
                    if (scene.environmentTexture) {
                        scene.environmentTexture.dispose();
                        scene.environmentTexture = null;
                    }
                    const skybox = scene.getMeshByName("hdrSkyBox");
                    if (skybox) skybox.dispose();
                    scene.createDefaultEnvironment({ createSkybox: true, skyboxSize: Math.max(modelSize * 5, 2000), createGround: false });
                } else {
                    resetCameraAndEnvironment(scene, camera);
                }
            } else {
                resetCameraAndEnvironment(scene, camera);
            }
        } else {
            resetCameraAndEnvironment(scene, camera);
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
        // Apply initial rendering mode after model is loaded and framed
        applyRenderingModeStyle(renderingMode); 
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
        if (grid) grid.setEnabled(true); 
        if (loadedAssetContainerRef.current) { 
            loadedAssetContainerRef.current.dispose();
            loadedAssetContainerRef.current = null;
        }
        resetCameraAndEnvironment(scene, camera);
      });

  }, [modelUrl, modelFileExtension, onModelLoaded, sceneRef, onModelHierarchyReady, renderingMode, applyRenderingModeStyle]); // Added renderingMode & applyRenderingModeStyle for initial application


  useEffect(() => {
    // This effect specifically handles changes to renderingMode for an already loaded model.
    if (isCurrentModelActuallyLoaded && loadedAssetContainerRef.current) {
      applyRenderingModeStyle(renderingMode);
    }
  }, [renderingMode, isCurrentModelActuallyLoaded, applyRenderingModeStyle]);
  
  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};

