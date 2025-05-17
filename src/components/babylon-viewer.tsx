
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
  Color4,
  // Texture, // No longer attempting to set samplingMode
} from '@babylonjs/core';
import { GridMaterial } from '@babylonjs/materials';
import '@babylonjs/loaders/glTF';
import '@babylonjs/loaders/OBJ';

import type { ModelNode, MaterialDetail } from './types';

export type RenderingMode = 'shaded' | 'non-shaded' | 'wireframe';
type EffectiveTheme = 'light' | 'dark';

interface BabylonViewerProps {
  modelUrl: string | null;
  modelFileExtension: string | null;
  onModelLoaded: (success: boolean, error?: string) => void;
  onCameraReady: (camera: ArcRotateCamera) => void;
  onFpsUpdate?: (fps: number) => void;
  onModelHierarchyReady?: (hierarchy: ModelNode[]) => void;
  onMaterialsReady?: (materials: MaterialDetail[]) => void;
  renderingMode: RenderingMode;
  nearClip: number;
  farClip: number;
  effectiveTheme: EffectiveTheme;
  isGridVisible: boolean;
  isAutoRotating: boolean;
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
  onMaterialsReady,
  renderingMode,
  nearClip,
  farClip,
  effectiveTheme,
  isGridVisible,
  isAutoRotating,
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
    
    const currentEnv = scene.environmentTexture;
    if (currentEnv) {
        currentEnv.dispose();
        scene.environmentTexture = null;
    }
    const skyboxMesh = scene.getMeshByName("hdrSkyBox"); 
    if (skyboxMesh) {
        skyboxMesh.dispose();
    }
    
    scene.createDefaultEnvironment({ 
        createSkybox: false,
        createGround: false,
        skyboxSize: 150, 
        enableGroundShadow: false, 
    });
    scene.environmentIntensity = 1.0;

    if (effectiveTheme === 'light') {
      scene.clearColor = new Color4(240 / 255, 240 / 255, 240 / 255, 1);
    } else { 
      scene.clearColor = new Color4(38 / 255, 38 / 255, 38 / 255, 1);
    }

    const groundMesh = scene.getMeshByName("grid");
    if(groundMesh) {
      groundMesh.position.y = 0; 
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTheme, sceneRef]); // sceneRef is stable after init


  const applyRenderingModeStyle = useCallback((newRenderingMode: RenderingMode, container: Nullable<AssetContainer>, currentModelFileExtension: string | null) => {
    if (currentModelFileExtension === '.obj') {
        return; 
    }
    if (!container || !sceneRef.current) return;

    const processSingleMaterial = (mat: Material) => {
      // Reset shared properties first
      mat.wireframe = false;
      mat.alpha = 1.0; // Default to opaque

      if (mat instanceof PBRMaterial) {
        mat.unlit = false; 
        // For PBR, ensure default transparency is respected unless overridden by wireframe/non-shaded
        // This block handles PBR transparency.
        if (mat.albedoTexture && mat.albedoTexture.hasAlpha) {
            if (mat.transparencyMode !== PBRMaterial.PBRMATERIAL_ALPHATEST) { // Correctly preserve ALPHATEST
                mat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
            }
            mat.useAlphaFromAlbedoTexture = true;
        } else {
            // If no alpha texture, ensure it's opaque.
            mat.transparencyMode = PBRMaterial.PBRMATERIAL_OPAQUE;
            mat.useAlphaFromAlbedoTexture = false; 
        }

      } else if (mat instanceof StandardMaterial) {
        mat.disableLighting = false; 
      }

      // Apply mode-specific properties
      switch (newRenderingMode) {
        case 'shaded':
          // Defaults already set above, PBR alpha handling also ensures shaded looks right
          break;
        case 'non-shaded':
          if (mat instanceof PBRMaterial) {
            mat.unlit = true;
          } else if (mat instanceof StandardMaterial) {
            mat.disableLighting = true;
          }
          break;
        case 'wireframe':
          mat.wireframe = true;
          // For wireframe, we usually want it unlit for clarity
          if (mat instanceof PBRMaterial) { 
            mat.unlit = true; 
          } else if (mat instanceof StandardMaterial) {
            mat.disableLighting = true; 
          }
          break;
      }
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneRef]); // sceneRef is stable


  // Effect for initial engine, scene, camera, lights, grid setup
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
    camera.minZ = nearClip; // Initial clip values
    camera.maxZ = farClip;  
    cameraRef.current = camera; 
    onCameraReady(camera);
    
    const light1 = new HemisphericLight("light1", new Vector3(1, 1, 0), scene);
    light1.intensity = 1.0;
    const light2 = new HemisphericLight("light2", new Vector3(-1, -1, -0.5), scene); 
    light2.intensity = 0.7;

    scene.createDefaultEnvironment({
        createSkybox: false, 
        createGround: false,
        skyboxSize: 150, 
        enableGroundShadow: false, 
    });
    scene.environmentIntensity = 1.0;
    
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
      animationGroupsRef.current = null;

      if (loadedAssetContainerRef.current) {
        loadedAssetContainerRef.current.dispose();
        loadedAssetContainerRef.current = null;
      }

      if (sceneRef.current) {
        const gridMesh = sceneRef.current.getMeshByName("grid");
        if (gridMesh && gridMesh.material) gridMesh.material.dispose();
        if (gridMesh) gridMesh.dispose(false, true); 

        const envTex = sceneRef.current.environmentTexture;
        if (envTex) envTex.dispose();
        
        const skyboxMesh = sceneRef.current.getMeshByName("hdrSkyBox"); 
        if(skyboxMesh) skyboxMesh.dispose();
        
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
  }, [onCameraReady]); // nearClip, farClip removed as they are handled in a separate effect


  // Effect for scene.onBeforeRenderObservable (auto-rotate, animation progress)
   useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (animationProgressObserverRef.current) {
      scene.onBeforeRenderObservable.remove(animationProgressObserverRef.current);
      animationProgressObserverRef.current = null;
    }
    
    const observer = scene.onBeforeRenderObservable.add(() => {
        if (isAutoRotating && cameraRef.current) {
          cameraRef.current.alpha += 0.005; 
        }

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
    animationProgressObserverRef.current = observer;

    return () => {
        if (scene && observer) {
            scene.onBeforeRenderObservable.remove(observer);
        }
        animationProgressObserverRef.current = null;
    };
  }, [isAutoRotating, onAnimationProgressUpdate, onAnimationStateChange, sceneRef]); 


  useEffect(() => {
    const activeCamera = sceneRef.current?.activeCamera;
    if (activeCamera) {
      activeCamera.minZ = nearClip;
      activeCamera.maxZ = farClip;
    }
  }, [nearClip, farClip, sceneRef]);

  // Effect for setting scene clearColor based on theme
  useEffect(() => {
    const scene = sceneRef.current;
    if (scene) {
      if (effectiveTheme === 'light') {
        scene.clearColor = new Color4(240 / 255, 240 / 255, 240 / 255, 1); 
      } else { 
        scene.clearColor = new Color4(38 / 255, 38 / 255, 38 / 255, 1);   
      }
    }
  }, [effectiveTheme, sceneRef]);


  // Effect for loading the model
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;

    if (!scene || !camera || !onModelLoaded) return;

    setIsCurrentModelActuallyLoaded(false); 
    if (onModelHierarchyReady) onModelHierarchyReady([]);
    if (onMaterialsReady) onMaterialsReady([]);
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
    const pluginExtension = modelFileExtension || undefined; 

    SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl, scene, undefined, pluginExtension)
      .then(container => {
        loadedAssetContainerRef.current = container;
        
        const oldEnv = scene.environmentTexture;
        if (oldEnv) {
            oldEnv.dispose();
            scene.environmentTexture = null;
        }
        const oldSkybox = scene.getMeshByName("hdrSkyBox"); 
        if (oldSkybox) {
            oldSkybox.dispose();
        }
        container.addAllToScene();

        container.materials.forEach(mat => {
            const processMaterialForCulling = (materialInstance: Material) => {
                materialInstance.backFaceCulling = false;
            };

            if (mat instanceof MultiMaterial) {
                mat.subMaterials.forEach(subMat => {
                    if (subMat) processMaterialForCulling(subMat);
                });
            } else {
                processMaterialForCulling(mat);
            }
        });
        
        const allModelMeshes = container.meshes.filter(m => m.name !== "grid" && !(m instanceof HemisphericLight) && !(m instanceof ArcRotateCamera) && !m.name.startsWith("__") && !m.name.endsWith("__"));
        
        let modelBoundingMin = new Vector3(Infinity, Infinity, Infinity);
        let modelBoundingMax = new Vector3(-Infinity, -Infinity, -Infinity);

        if (allModelMeshes.length > 0) {
            const visibleEnabledMeshes = allModelMeshes.filter(m => m.isVisible && m.isEnabled());

            if (visibleEnabledMeshes.length > 0) {
                visibleEnabledMeshes.forEach(mesh => mesh.computeWorldMatrix(true)); 
                camera.zoomOn(visibleEnabledMeshes, true); 

                visibleEnabledMeshes.forEach((meshNode: AbstractMesh) => {
                    const boundingInfo = meshNode.getBoundingInfo(); 
                    if (boundingInfo) {
                        modelBoundingMin = Vector3.Minimize(modelBoundingMin, boundingInfo.boundingBox.minimumWorld);
                        modelBoundingMax = Vector3.Maximize(modelBoundingMax, boundingInfo.boundingBox.maximumWorld);
                    }
                });

                if (modelBoundingMin.x !== Infinity) { 
                    if(grid) {
                        grid.position.y = modelBoundingMin.y - 0.01; 
                    }
                    scene.createDefaultEnvironment({
                        createSkybox: false,
                        createGround: false,
                        skyboxSize: Math.max(150, (modelBoundingMax.subtract(modelBoundingMin)).length() * 2),
                        enableGroundShadow: false,
                    });
                    scene.environmentIntensity = 1.0;
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

        // Set clear color based on theme after model load and environment setup
        if (effectiveTheme === 'light') {
          scene.clearColor = new Color4(240 / 255, 240 / 255, 240 / 255, 1);
        } else { 
          scene.clearColor = new Color4(38 / 255, 38 / 255, 38 / 255, 1);
        }

        // Apply rendering mode style (which includes transparency logic) AFTER environment is set
        applyRenderingModeStyle(renderingMode, container, modelFileExtension); 
        
        onModelLoaded(true);
        setIsCurrentModelActuallyLoaded(true); 

        if (onModelHierarchyReady) {
            const buildNodeHierarchy = (babylonNode: Node): ModelNode => {
              let nodeType = "Node";
              if (babylonNode instanceof Mesh) nodeType = "Mesh";
              else if (babylonNode instanceof TransformNode) nodeType = "TransformNode";
          
              const children = (babylonNode.getChildren ? babylonNode.getChildren() : [])
                  .filter(child => {
                      const sceneHelperNodeNames = ["camera", "light1", "light2", "grid", "hdrSkyBox", "BackgroundPlane", "BackgroundSkybox"]; 
                      return !sceneHelperNodeNames.some(helperName => child.name.startsWith(helperName) || child.name.includes(helperName));
                  })
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
                 const sceneHelperNodeNames = ["camera", "light1", "light2", "grid", "hdrSkyBox", "BackgroundPlane", "BackgroundSkybox"];
                 return !sceneHelperNodeNames.some(helperName => node.name.startsWith(helperName) || node.name.includes(helperName));
              })
              .map(buildNodeHierarchy);
          
            onModelHierarchyReady(hierarchyRoots);
          }

        if (onMaterialsReady) {
          const materials: MaterialDetail[] = [];
          (container.materials || []).forEach(mat => {
            let type = "Unknown";
            if (mat instanceof PBRMaterial) type = "PBRMaterial";
            else if (mat instanceof StandardMaterial) type = "StandardMaterial";
            else if (mat instanceof MultiMaterial) type = "MultiMaterial";
            else type = mat.getClassName();
            
            materials.push({
              id: mat.uniqueId.toString(),
              name: mat.name || `Unnamed ${type}`,
              type: type,
            });
          });
          onMaterialsReady(materials);
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
        if (onModelHierarchyReady) onModelHierarchyReady([]);
        if (onMaterialsReady) onMaterialsReady([]);
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
    modelUrl, 
    modelFileExtension, 
    onModelLoaded, 
    onModelHierarchyReady,
    onMaterialsReady, 
    onAnimationsAvailable,
    internalResetCameraAndEnvironment,
    applyRenderingModeStyle, 
    effectiveTheme,
    sceneRef,
    renderingMode 
  ]);

  // Effect for applying rendering mode when it changes
  useEffect(() => {
    if (isCurrentModelActuallyLoaded && loadedAssetContainerRef.current) {
      applyRenderingModeStyle(renderingMode, loadedAssetContainerRef.current, modelFileExtension);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderingMode, isCurrentModelActuallyLoaded, modelFileExtension, applyRenderingModeStyle]);


  // Effect for toggling grid visibility
  useEffect(() => {
    if (sceneRef.current) {
      const gridMesh = sceneRef.current.getMeshByName("grid");
      if (gridMesh) {
        gridMesh.setEnabled(isGridVisible);
      }
    }
  }, [isGridVisible, sceneRef]); 

  // Effect for controlling animation play/pause
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

  // Effect for seeking animation
  useEffect(() => {
    if (animationGroupsRef.current && typeof requestAnimationSeek === 'number' && totalDurationSecondsRef.current > 0) {
      const targetFrame = (requestAnimationSeek / 100) * (totalDurationSecondsRef.current * (frameRateRef.current || 60));
      animationGroupsRef.current.forEach(group => {
        const wasPlaying = group.isPlaying;
        group.pause(); 
        group.goToFrame(targetFrame);
        
        if (requestPlayAnimation === true || (requestPlayAnimation === undefined && wasPlaying)) {
           group.play(true);
           isPlayingInternalRef.current = true;
           if (onAnimationStateChange) onAnimationStateChange(true);
        } else {
           isPlayingInternalRef.current = false;
           if (onAnimationStateChange) onAnimationStateChange(false);
        }
      });
      
      if (onAnimationProgressUpdate) {
        const currentTime = (requestAnimationSeek / 100) * totalDurationSecondsRef.current;
        onAnimationProgressUpdate(requestAnimationSeek, currentTime, totalDurationSecondsRef.current);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestAnimationSeek, requestPlayAnimation]); 


  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};

