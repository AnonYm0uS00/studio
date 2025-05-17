
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
  AnimationGroup,
  // Animation, // No longer directly used
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
  renderingMode: RenderingMode;
  nearClip: number;
  farClip: number;
  effectiveTheme: EffectiveTheme;
  isGridVisible: boolean;
  requestPlayAnimation?: boolean;
  requestAnimationSeek?: number; // Percentage 0-100
  onAnimationsAvailable?: (available: boolean, duration: number) => void;
  onAnimationStateChange?: (isPlaying: boolean) => void;
  onAnimationProgressUpdate?: (progress: number, currentTime: number, totalDuration: number) => void;
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
  requestPlayAnimation,
  requestAnimationSeek,
  onAnimationsAvailable,
  onAnimationStateChange,
  onAnimationProgressUpdate,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Nullable<Engine>>(null);
  const sceneRef = useRef<Nullable<Scene>>(null);
  const cameraRef = useRef<Nullable<ArcRotateCamera>>(null);
  const loadedAssetContainerRef = useRef<Nullable<AssetContainer>>(null);
  const [isCurrentModelActuallyLoaded, setIsCurrentModelActuallyLoaded] = useState(false);

  const animationGroupsRef = useRef<Nullable<AnimationGroup[]>>(null);
  const totalDurationSecondsRef = useRef<number>(0);
  const frameRateRef = useRef<number>(60);
  const isPlayingInternalRef = useRef<boolean>(false);
  const animationProgressObserverRef = useRef<any>(null);


  const internalResetCameraAndEnvironment = useCallback(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    camera.setTarget(Vector3.Zero());
    camera.radius = 10;
    camera.alpha = -Math.PI / 2;
    camera.beta = Math.PI / 2.5;
    
    const groundMesh = scene.getMeshByName("grid");
    if(groundMesh) {
      groundMesh.position.y = 0; 
    }
    // scene.environmentIntensity = 0.7; // No longer setting environment here
  }, []);


  const applyRenderingModeStyle = useCallback((newRenderingMode: RenderingMode, container: Nullable<AssetContainer>, currentModelFileExtension: string | null) => {
    if (!container || !sceneRef.current) return;
    if (currentModelFileExtension === '.obj' && (newRenderingMode === 'non-shaded' || newRenderingMode === 'wireframe')) {
        // console.log("Skipping rendering mode change for OBJ (non-shaded/wireframe)");
        return; 
    }

    const processSingleMaterial = (mat: Material) => {
      // Always ensure alpha is 1 unless specifically handled otherwise (e.g. by PBR transparencyMode)
      // This helps ensure wireframe is visible and model isn't accidentally transparent.
      if (! (mat instanceof PBRMaterial && mat.transparencyMode !== PBRMaterial.PBR_OPAQUE) ) {
        mat.alpha = 1.0; 
      }

      if (newRenderingMode === 'shaded') {
        mat.wireframe = false;
        if (mat instanceof PBRMaterial) {
          mat.unlit = false;
        } else if (mat instanceof StandardMaterial) {
          mat.disableLighting = false;
        }
      } else if (newRenderingMode === 'non-shaded') {
        mat.wireframe = false;
        if (mat instanceof PBRMaterial) {
          mat.unlit = true;
        } else if (mat instanceof StandardMaterial) {
          mat.disableLighting = true;
        }
      } else if (newRenderingMode === 'wireframe') {
        mat.wireframe = true;
        // Also make wireframe unlit for clarity
        if (mat instanceof PBRMaterial) {
          mat.unlit = true;
        } else if (mat instanceof StandardMaterial) {
          mat.disableLighting = true;
        }
      }
      mat.markAsDirty(Material.AllDirtyFlag);
    };
    
    container.meshes.forEach((mesh: AbstractMesh) => {
      if (mesh.name === "grid" || !mesh.material) return;

      if (mesh.material instanceof MultiMaterial) {
        mesh.material.subMaterials.forEach(subMat => {
          if (subMat) processSingleMaterial(subMat);
        });
      } else {
        processSingleMaterial(mesh.material);
      }
    });
  }, []);


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
    cameraRef.current = camera; 
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
    
    if (animationProgressObserverRef.current) {
      scene.onBeforeRenderObservable.remove(animationProgressObserverRef.current);
    }
    animationProgressObserverRef.current = scene.onBeforeRenderObservable.add(() => {
        if (isPlayingInternalRef.current && animationGroupsRef.current && animationGroupsRef.current.length > 0 && totalDurationSecondsRef.current > 0) {
            const group = animationGroupsRef.current[0]; 
            if (group.isPlaying) {
                 let currentFrame = 0;
                 const firstAnimatable = group.animatables.find(a => a.animationLoop !== null); 
                 if (firstAnimatable) {
                    currentFrame = firstAnimatable.masterFrame;
                 } else if (group.animatables.length > 0 && group.animatables[0]) {
                    currentFrame = group.animatables[0].masterFrame;
                 }

                const currentTime = currentFrame / (frameRateRef.current || 60);
                let progress = (currentTime / totalDurationSecondsRef.current) * 100;
                progress = Math.min(100, Math.max(0, progress));

                if (onAnimationProgressUpdate) {
                    onAnimationProgressUpdate(progress, currentTime, totalDurationSecondsRef.current);
                }

                if (!group.loopAnimation && currentFrame >= group.to && group.isPlaying) { 
                    isPlayingInternalRef.current = false;
                    group.stop(); 
                    if (onAnimationStateChange) {
                        onAnimationStateChange(false);
                    }
                }
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
      if (sceneRef.current && animationProgressObserverRef.current) {
        sceneRef.current.onBeforeRenderObservable.remove(animationProgressObserverRef.current);
        animationProgressObserverRef.current = null;
      }
      if (loadedAssetContainerRef.current) {
        loadedAssetContainerRef.current.dispose();
        loadedAssetContainerRef.current = null;
      }
      animationGroupsRef.current = null;

      if (sceneRef.current) {
        const gridMesh = sceneRef.current.getMeshByName("grid");
        if (gridMesh && gridMesh.material) gridMesh.material.dispose();
        if (gridMesh) gridMesh.dispose(false, true); 
        
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      cameraRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCameraReady, onFpsUpdate, onAnimationProgressUpdate, onAnimationStateChange]); 

  useEffect(() => {
    if (sceneRef.current && sceneRef.current.activeCamera) {
      if (effectiveTheme === 'light') {
        sceneRef.current.clearColor = new Color4(240/255, 240/255, 240/255, 1); 
      } else { 
        sceneRef.current.clearColor = new Color4(38/255, 38/255, 38/255, 1); 
      }
    }
  }, [effectiveTheme]);

  useEffect(() => {
    const activeCamera = sceneRef.current?.activeCamera;
    if (activeCamera) {
      activeCamera.minZ = nearClip;
      activeCamera.maxZ = farClip;
    }
  }, [nearClip, farClip]);


  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;

    if (!scene || !camera || !onModelLoaded) return;

    setIsCurrentModelActuallyLoaded(false); 
    if (onModelHierarchyReady) onModelHierarchyReady([]);
    if (onAnimationsAvailable) onAnimationsAvailable(false, 0);
    animationGroupsRef.current = null;
    totalDurationSecondsRef.current = 0;
    isPlayingInternalRef.current = false;

    if (loadedAssetContainerRef.current) {
      loadedAssetContainerRef.current.removeAllFromScene(); 
      loadedAssetContainerRef.current.dispose(); 
      loadedAssetContainerRef.current = null;
    }
    
    const grid = scene.getMeshByName("grid");

    if (!modelUrl) {
        internalResetCameraAndEnvironment(); 
        if (grid) grid.position.y = 0; 
        return;
    }

    const isDataUrl = modelUrl.startsWith('data:');
    const rootUrl = isDataUrl ? "" : modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
    const pluginExtension = isDataUrl ? modelFileExtension || undefined : undefined;

    SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl, scene, undefined, pluginExtension)
      .then(container => {
        loadedAssetContainerRef.current = container;
        container.addAllToScene();

        // Force all materials to be double-sided
        container.materials.forEach(mat => {
            mat.backFaceCulling = false;
        });

        const allModelMeshes = container.meshes.filter(m => m.name !== "grid" && !(m instanceof HemisphericLight) && !(m instanceof ArcRotateCamera) && !m.name.startsWith("__") && !m.name.endsWith("__"));
        
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
        
        applyRenderingModeStyle(renderingMode, container, modelFileExtension); 
        
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
                      child.name !== "camera" && 
                      !child.name.startsWith("light1") && 
                      !child.name.startsWith("light2") && 
                      child.name !== "grid" && 
                      !(child instanceof HemisphericLight) && 
                      !(child instanceof ArcRotateCamera) &&
                      (!(child.name.startsWith("__") && child.name.endsWith("__")) || (child.getChildren && child.getChildren().length > 0) || child instanceof Mesh)
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
              .filter(node => {
                  return node.name !== "grid" &&
                         node.name !== "camera" && 
                         !node.name.startsWith("light1") && 
                         !node.name.startsWith("light2") && 
                         !(node instanceof HemisphericLight) && 
                         !(node instanceof ArcRotateCamera) &&
                         (!(node.name.startsWith("__") && node.name.endsWith("__")) || (node.getChildren && node.getChildren().length > 0) || node instanceof Mesh);
              })
              .map(buildNodeHierarchy)
              .filter(node => !(node.name.startsWith("__") && node.name.endsWith("__") && node.children.length === 0 && node.type !== "Mesh"));
          
            onModelHierarchyReady(hierarchyRoots);
          }

        if (container.animationGroups && container.animationGroups.length > 0) {
            animationGroupsRef.current = container.animationGroups;
            let maxDuration = 0;
            let detectedFrameRate = 60; 
            animationGroupsRef.current.forEach(group => {
                group.stop();
                group.reset(); 
                group.goToFrame(0); 

                const groupToFrame = group.to; 
                if (group.targetedAnimations.length > 0 && group.targetedAnimations[0].animation) {
                    const animFrameRate = group.targetedAnimations[0].animation.frameRate;
                    if (animFrameRate > 0) detectedFrameRate = animFrameRate;
                }
                const duration = groupToFrame / detectedFrameRate;
                if (duration > maxDuration) {
                    maxDuration = duration;
                }
            });
            frameRateRef.current = detectedFrameRate;
            totalDurationSecondsRef.current = maxDuration;
            if (onAnimationsAvailable) {
                onAnimationsAvailable(true, maxDuration);
            }
        } else {
            if (onAnimationsAvailable) {
                onAnimationsAvailable(false, 0);
            }
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
        if (modelFileExtension && ['.obj'].includes(modelFileExtension) && isDataUrl) {
             userMessage += ` For ${modelFileExtension.toUpperCase()} files loaded from local disk, any associated material files (like .mtl) or external textures are typically not packaged within the data URI and may not load. Consider using GLB format for self-contained models.`;
        } else if (modelFileExtension && ['.obj'].includes(modelFileExtension) && !isDataUrl) {
             userMessage += ` For ${modelFileExtension.toUpperCase()} files from a URL, ensure any associated material files and textures are accessible (usually in the same directory or correctly referenced).`;
        }

        onModelLoaded(false, userMessage);
        setIsCurrentModelActuallyLoaded(false);
        if (onAnimationsAvailable) onAnimationsAvailable(false, 0);
        if (grid) grid.position.y = 0; 
        if (loadedAssetContainerRef.current) { 
            loadedAssetContainerRef.current.removeAllFromScene();
            loadedAssetContainerRef.current.dispose();
            loadedAssetContainerRef.current = null;
        }
        animationGroupsRef.current = null;
        internalResetCameraAndEnvironment(); 
      });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    modelUrl, modelFileExtension, onModelLoaded, onModelHierarchyReady, onAnimationsAvailable,
    internalResetCameraAndEnvironment, // applyRenderingModeStyle is called from other effects
    // renderingMode, // Handled by its own effect
  ]);

  useEffect(() => {
    if (isCurrentModelActuallyLoaded && loadedAssetContainerRef.current) {
      applyRenderingModeStyle(renderingMode, loadedAssetContainerRef.current, modelFileExtension);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderingMode, isCurrentModelActuallyLoaded, modelFileExtension]); // applyRenderingModeStyle is stable due to useCallback


  useEffect(() => {
    if (sceneRef.current) {
      const gridMesh = sceneRef.current.getMeshByName("grid");
      if (gridMesh) {
        gridMesh.setEnabled(isGridVisible);
      }
    }
  }, [isGridVisible]);

  useEffect(() => {
    if (animationGroupsRef.current && typeof requestPlayAnimation === 'boolean') {
      animationGroupsRef.current.forEach(group => {
        if (requestPlayAnimation) {
          if (!group.isPlaying) group.play(true); 
        } else {
          if (group.isPlaying) group.pause();
        }
      });
      isPlayingInternalRef.current = requestPlayAnimation;
      if (onAnimationStateChange) onAnimationStateChange(requestPlayAnimation);
    }
  }, [requestPlayAnimation, onAnimationStateChange]);

  useEffect(() => {
    if (animationGroupsRef.current && typeof requestAnimationSeek === 'number' && totalDurationSecondsRef.current > 0) {
      const targetFrame = (requestAnimationSeek / 100) * (totalDurationSecondsRef.current * (frameRateRef.current || 60));
      animationGroupsRef.current.forEach(group => {
        const wasPlaying = group.isPlaying;
        if (wasPlaying) group.pause(); 

        group.goToFrame(targetFrame);
        
        if (wasPlaying && (typeof requestPlayAnimation === 'undefined' || requestPlayAnimation === true)) { 
           group.play(true);
        } else if ((typeof requestPlayAnimation !== 'undefined' && !requestPlayAnimation) && group.isPlaying) { 
           group.pause();
        }
      });
      
      if (onAnimationProgressUpdate) {
        const currentTime = (requestAnimationSeek / 100) * totalDurationSecondsRef.current;
        onAnimationProgressUpdate(requestAnimationSeek, currentTime, totalDurationSecondsRef.current);
      }
    }
  }, [requestAnimationSeek, onAnimationProgressUpdate, requestPlayAnimation]);


  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};

