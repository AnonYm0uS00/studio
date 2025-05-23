
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
  Color4,
  Material,
  PBRMaterial,
  StandardMaterial,
  MultiMaterial,
  Node,
  TransformNode,
  Mesh,
  AnimationGroup,
  Tools,
  Texture,
  FilesInput, // Keep for potential future use, but current logic doesn't use it
  InstancedMesh,
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
  requestScreenshot: boolean;
  onScreenshotTaken: (dataUrl: string) => void;
  requestFocusObject?: boolean;
  onObjectFocused?: () => void;
  hiddenMeshIds?: Set<string>;
}

const isHelperNodeByName = (nodeName: string): boolean => {
  const helperNodeNames = ["camera", "light1", "light2", "grid", "BackgroundPlane", "BackgroundSkybox", "hdrSkyBox"];
  return helperNodeNames.includes(nodeName);
};

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
  requestScreenshot,
  onScreenshotTaken,
  requestFocusObject,
  onObjectFocused,
  hiddenMeshIds,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Nullable<Engine>>(null);
  const sceneRef = useRef<Nullable<Scene>>(null);
  const cameraRef = useRef<Nullable<ArcRotateCamera>>(null);
  const loadedAssetContainerRef = useRef<Nullable<AssetContainer>>(null);
  const [isCurrentModelActuallyLoaded, setIsCurrentModelActuallyLoaded] = useState(false);
  const activeModelUrlRef = useRef<string | null>(null); // To track the URL this effect instance is for

  const animationGroupsRef = useRef<Nullable<AnimationGroup[]>>(null);
  const totalDurationSecondsRef = useRef<number>(0);
  const frameRateRef = useRef<number>(60);
  const isPlayingInternalRef = useRef<boolean>(false);
  const animationProgressObserverRef = useRef<Nullable<ReturnType<Scene['onBeforeRenderObservable']['add']>>>(null);
  
  const internalResetCameraAndEnvironment = useCallback(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!scene || !camera) return;

    camera.setTarget(Vector3.Zero());
    camera.radius = 10;
    camera.alpha = -Math.PI / 2;
    camera.beta = Math.PI / 2.5;
    
    const oldEnv = scene.environmentTexture;
    if (oldEnv) {
        scene.environmentTexture = null; // Detach first
        oldEnv.dispose();
    }
    const existingHdrSkybox = scene.getMeshByName("hdrSkyBox");
    if (existingHdrSkybox) {
      existingHdrSkybox.dispose(false, true);
    }

    scene.createDefaultEnvironment({ 
        createSkybox: false, // No visual skybox, clearColor will be background
        createGround: false, // No default ground
        skyboxSize: 150, 
        enableGroundShadow: false, 
    });
    scene.environmentIntensity = 1.0;
    
    if (sceneRef.current) {
        if (effectiveTheme === 'light') {
            sceneRef.current.clearColor = new Color4(240 / 255, 240 / 255, 240 / 255, 1); 
        } else { 
            sceneRef.current.clearColor = new Color4(38 / 255, 38 / 255, 38 / 255, 1);   
        }
    }

    const groundMesh = scene.getMeshByName("grid");
    if(groundMesh) {
      groundMesh.position.y = 0; 
    }
  }, [sceneRef, effectiveTheme]);


  const applyRenderingModeStyle = useCallback((
    newRenderingMode: RenderingMode,
    assetContainer: Nullable<AssetContainer>,
    currentModelFileExtension: string | null
  ) => {
    if (!assetContainer || !sceneRef.current ) return;
    
    const processSingleMaterial = (mat: Material) => {
        // Reset common properties first for 'shaded'
        mat.wireframe = false;

        if (mat instanceof PBRMaterial) {
            mat.unlit = false;
        } else if (mat instanceof StandardMaterial) {
            mat.disableLighting = false;
            // For StandardMaterial, explicitly set emissive/ambient back for shaded mode if they were changed
            mat.emissiveColor = mat.emissiveColor ? mat.emissiveColor.copyFrom(Color3.Black()) : new Color3(0,0,0); 
            mat.ambientColor = mat.ambientColor ? mat.ambientColor.copyFrom(Color3.Black()) : new Color3(0,0,0);
        }

        // Apply selected mode
        switch (newRenderingMode) {
            case 'shaded':
                // Defaults applied above are for shaded
                break;
            case 'non-shaded':
                if (mat instanceof PBRMaterial) {
                    mat.unlit = true;
                } else if (mat instanceof StandardMaterial) {
                    mat.disableLighting = true;
                    mat.emissiveColor = Color3.Black();
                    mat.ambientColor = Color3.Black();
                }
                break;
            case 'wireframe':
                mat.wireframe = true;
                if (mat instanceof PBRMaterial) {
                    mat.unlit = true; 
                } else if (mat instanceof StandardMaterial) {
                    mat.disableLighting = true;
                    mat.emissiveColor = Color3.Black(); 
                    mat.ambientColor = Color3.Black(); 
                }
                break;
        }
         if (currentModelFileExtension === '.obj') {
             mat.markAsDirty(Material.AllDirtyFlag);
         }
    };
    
    assetContainer.meshes.forEach((mesh: AbstractMesh) => {
        if (isHelperNodeByName(mesh.name) || !mesh.material) return;

        if (mesh.material instanceof MultiMaterial) {
            mesh.material.subMaterials.forEach(subMat => {
                if (subMat) processSingleMaterial(subMat);
            });
        } else {
            processSingleMaterial(mesh.material);
        }
    });
  }, []); 


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
    camera.upperRadiusLimit = 30000; 
    cameraRef.current = camera; 
    onCameraReady(camera);
    
    const light1 = new HemisphericLight("light1", new Vector3(1, 1, 0), scene);
    light1.intensity = 1.0;
    const light2 = new HemisphericLight("light2", new Vector3(-1, -1, -0.5), scene); 
    light2.intensity = 0.7;
    
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
    
    scene.createDefaultEnvironment({ 
      createSkybox: false, 
      createGround: false,  
      skyboxSize: 150, 
      enableGroundShadow: false, 
    });
    scene.environmentIntensity = 1.0;
    
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

      // Remove blob URL revocation from here, handled by model loading effect
      // if (activeModelUrlRef.current && activeModelUrlRef.current.startsWith('blob:')) {
      //   URL.revokeObjectURL(activeModelUrlRef.current);
      // }
      activeModelUrlRef.current = null;

      if (loadedAssetContainerRef.current) {
        loadedAssetContainerRef.current.dispose();
        loadedAssetContainerRef.current = null;
      }

      if (sceneRef.current) {
        const gridMesh = sceneRef.current.getMeshByName("grid");
        if (gridMesh && gridMesh.material) gridMesh.material.dispose();
        if (gridMesh) gridMesh.dispose(false, true); 

        const envTex = sceneRef.current.environmentTexture;
        if (envTex) {
            sceneRef.current.environmentTexture = null;
            envTex.dispose();
        }
        
        const existingHdrSkybox = sceneRef.current.getMeshByName("hdrSkyBox");
        if (existingHdrSkybox) {
          existingHdrSkybox.dispose(false, true);
        }
                
        sceneRef.current.dispose();
        sceneRef.current = null;
      }
      if (engineRef.current) {
        engineRef.current.dispose();
        engineRef.current = null;
      }
      cameraRef.current = null;
      setIsCurrentModelActuallyLoaded(false);
    };
  }, [onCameraReady, onFpsUpdate]);


  // Effect for scene.onBeforeRenderObservable (auto-rotate, animation progress)
   useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (animationProgressObserverRef.current) {
      scene.onBeforeRenderObservable.remove(animationProgressObserverRef.current);
      animationProgressObserverRef.current = null;
    }
    
    const observer = scene.onBeforeRenderObservable.add(() => {
        if (isAutoRotating && cameraRef.current && loadedAssetContainerRef.current && isCurrentModelActuallyLoaded ) { 
          cameraRef.current.alpha += 0.005; 
        }

        if (isPlayingInternalRef.current && animationGroupsRef.current && animationGroupsRef.current.length > 0 && totalDurationSecondsRef.current > 0 ) {
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
        if (scene && animationProgressObserverRef.current) {
            scene.onBeforeRenderObservable.remove(animationProgressObserverRef.current);
            animationProgressObserverRef.current = null;
        }
    };
  }, [isAutoRotating, isCurrentModelActuallyLoaded, onAnimationProgressUpdate, onAnimationStateChange, sceneRef]);


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
    const currentLoadedUrl = modelUrl; // Capture the URL for this specific effect run

    if (!scene || !camera || !onModelLoaded) return;

    // Dispose previous model and revoke its URL if necessary
    if (loadedAssetContainerRef.current) {
        loadedAssetContainerRef.current.dispose();
        loadedAssetContainerRef.current = null;
    }
    if (scene.environmentTexture) { // Dispose previous env texture
        const oldEnvTex = scene.environmentTexture;
        scene.environmentTexture = null;
        oldEnvTex.dispose();
    }
    // No URL.revokeObjectURL calls here.

    activeModelUrlRef.current = currentLoadedUrl;
    setIsCurrentModelActuallyLoaded(false); 
    if (onModelHierarchyReady) onModelHierarchyReady([]);
    if (onMaterialsReady) onMaterialsReady([]);
    if (onAnimationsAvailable) onAnimationsAvailable(false, 0);
    animationGroupsRef.current = null;
    totalDurationSecondsRef.current = 0;
    isPlayingInternalRef.current = false;
    
    const grid = scene.getMeshByName("grid");

    if (!currentLoadedUrl) {
        internalResetCameraAndEnvironment(); 
        return;
    }

    const isDataUrl = currentLoadedUrl.startsWith('data:');
    let rootUrl = isDataUrl ? "" : currentLoadedUrl.substring(0, currentLoadedUrl.lastIndexOf('/') + 1);
    let fileForLoader = isDataUrl ? currentLoadedUrl : currentLoadedUrl.substring(currentLoadedUrl.lastIndexOf('/') + 1);
    
    let loadPromise: Promise<AssetContainer>;
    
    const pluginExtension = modelFileExtension || undefined;
    loadPromise = SceneLoader.LoadAssetContainerAsync(rootUrl, fileForLoader, scene, undefined, pluginExtension);
    
    loadPromise
      .then(container => {
        if (activeModelUrlRef.current !== currentLoadedUrl) { // A new load has started
            container.dispose();
            return;
        }

        loadedAssetContainerRef.current = container;
        container.addAllToScene();
        
        const allModelMeshes = container.meshes.filter(m => !isHelperNodeByName(m.name) && !(m instanceof HemisphericLight) && !(m instanceof ArcRotateCamera));
        
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
                    const oldEnv = scene.environmentTexture; // Check again before creating new
                    if (oldEnv) { scene.environmentTexture = null; oldEnv.dispose(); }
                    
                    const existingHdrSkybox = scene.getMeshByName("hdrSkyBox");
                    if (existingHdrSkybox) {
                      existingHdrSkybox.dispose(false, true);
                    }

                    scene.createDefaultEnvironment({
                        createSkybox: false, 
                        createGround: false, 
                        skyboxSize: Math.max(150, (modelBoundingMax.subtract(modelBoundingMin)).length() * 2.5),
                        enableGroundShadow: false,
                    });
                    scene.environmentIntensity = 1.0;
                   
                    if (sceneRef.current) { // Re-apply clearColor based on theme
                        if (effectiveTheme === 'light') {
                            sceneRef.current.clearColor = new Color4(240 / 255, 240 / 255, 240 / 255, 1); 
                        } else { 
                            sceneRef.current.clearColor = new Color4(38 / 255, 38 / 255, 38 / 255, 1);   
                        }
                    }
                } else { 
                    internalResetCameraAndEnvironment();
                }
            } else { 
                internalResetCameraAndEnvironment();
            }
        } else { 
            internalResetCameraAndEnvironment();
        }
        
        if (loadedAssetContainerRef.current) {
          loadedAssetContainerRef.current.materials.forEach(mat => {
            mat.backFaceCulling = false; 
            if (mat instanceof PBRMaterial) {
              const pbrMat = mat as PBRMaterial;
              if (pbrMat.albedoTexture && pbrMat.albedoTexture.hasAlpha) {
                  pbrMat.useAlphaFromAlbedoTexture = true;
                  if (pbrMat.transparencyMode === PBRMaterial.PBRMATERIAL_OPAQUE) {
                     pbrMat.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
                  }
              }
            } else if (mat instanceof StandardMaterial) {
              const stdMat = mat as StandardMaterial;
              if (stdMat.diffuseTexture && stdMat.diffuseTexture.hasAlpha) {
                  stdMat.useAlphaFromDiffuseTexture = true;
                  if (stdMat.alpha === 0 && stdMat.transparencyMode !== StandardMaterial.ALPHATOCOVERAGE) stdMat.alpha = 1; 
              }
            }
          });
          applyRenderingModeStyle(renderingMode, loadedAssetContainerRef.current, modelFileExtension);
        }
        
        onModelLoaded(true);
        setIsCurrentModelActuallyLoaded(true); 

        if (onModelHierarchyReady) {
            const buildNodeHierarchy = (babylonNode: Node): ModelNode => {
              let nodeType = "Node";
              if (babylonNode instanceof Mesh) nodeType = "Mesh";
              else if (babylonNode instanceof InstancedMesh) nodeType = "InstancedMesh";
              else if (babylonNode instanceof TransformNode) nodeType = "TransformNode";
              else if (babylonNode instanceof AbstractMesh) nodeType = "AbstractMesh"; 
          
              const children = (babylonNode.getChildren ? babylonNode.getChildren() : [])
                  .filter(child => !isHelperNodeByName(child.name))
                  .map(buildNodeHierarchy);
          
              return {
                id: babylonNode.uniqueId.toString(),
                name: babylonNode.name || `Unnamed ${nodeType}`,
                type: nodeType,
                children: children,
              };
            };
          
            const hierarchyRoots: ModelNode[] = container.rootNodes
              .filter(node => !isHelperNodeByName(node.name)) 
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
        if (activeModelUrlRef.current !== currentLoadedUrl) { // A new load has started, ignore error from this old one
            return;
        }
        console.error("Error loading model:", error);
        let userMessage = "Unknown error during model loading.";
        if (error.message) {
            userMessage = error.message;
        } else if (typeof error === 'string') {
            userMessage = error;
        }
        onModelLoaded(false, userMessage);
        setIsCurrentModelActuallyLoaded(false);
        if (onModelHierarchyReady) onModelHierarchyReady([]);
        if (onMaterialsReady) onMaterialsReady([]);
        if (onAnimationsAvailable) onAnimationsAvailable(false, 0);
        if (loadedAssetContainerRef.current) { 
            loadedAssetContainerRef.current.removeAllFromScene();
            loadedAssetContainerRef.current.dispose();
            loadedAssetContainerRef.current = null;
        }
        animationGroupsRef.current = null;
        internalResetCameraAndEnvironment();
      });

      return () => {
          // Cleanup if the effect re-runs before promise resolves or if component unmounts
          // The main unmount cleanup in the initial useEffect handles engine/scene disposal
          if (loadedAssetContainerRef.current) {
            loadedAssetContainerRef.current.dispose();
            loadedAssetContainerRef.current = null;
          }
          // No URL.revokeObjectURL for activeModelUrlRef.current here; it's handled on new load or full unmount
      };

  }, [
    modelUrl, 
    modelFileExtension, 
    onModelLoaded, 
    onModelHierarchyReady,
    onMaterialsReady, 
    onAnimationsAvailable,
    internalResetCameraAndEnvironment,
    applyRenderingModeStyle,
    renderingMode, 
    effectiveTheme, 
    sceneRef,
    cameraRef
  ]);

  // Effect for applying rendering mode when it changes
  useEffect(() => {
    if (isCurrentModelActuallyLoaded && loadedAssetContainerRef.current) {
      applyRenderingModeStyle(renderingMode, loadedAssetContainerRef.current, modelFileExtension);
    }
  }, [renderingMode, isCurrentModelActuallyLoaded, applyRenderingModeStyle, modelFileExtension]);


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
    if (!animationGroupsRef.current) return;
    if (typeof requestPlayAnimation === 'boolean' ) {
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
    if (!animationGroupsRef.current) return;
    if (typeof requestAnimationSeek === 'number' && totalDurationSecondsRef.current > 0 ) {
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
  }, [requestAnimationSeek, requestPlayAnimation, onAnimationProgressUpdate, onAnimationStateChange]); 

  // Effect for handling screenshot request
  useEffect(() => {
    if (requestScreenshot && engineRef.current && sceneRef.current?.activeCamera && onScreenshotTaken ) {
      Tools.CreateScreenshotUsingRenderTarget(
        engineRef.current,
        sceneRef.current.activeCamera,
        { precision: 1.0 }, 
        (data) => {
          onScreenshotTaken(data);
        }
      );
    }
  }, [requestScreenshot, onScreenshotTaken, sceneRef]);

  const focusOnLoadedModel = useCallback(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const container = loadedAssetContainerRef.current;

    if (!camera || !container || !scene) return;

    const grid = scene.getMeshByName("grid");

    const allModelMeshes = container.meshes.filter(m =>
      !isHelperNodeByName(m.name) &&
      !(m instanceof HemisphericLight) &&
      !(m instanceof ArcRotateCamera)
    );

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
          if (grid) {
            grid.position.y = modelBoundingMin.y - 0.01;
          }
          const oldEnv = scene.environmentTexture;
          if (oldEnv) {
            scene.environmentTexture = null;
            oldEnv.dispose();
          }

          const existingHdrSkybox = scene.getMeshByName("hdrSkyBox");
          if (existingHdrSkybox) {
            existingHdrSkybox.dispose(false, true);
          }
          
          scene.createDefaultEnvironment({
            createSkybox: false, 
            createGround: false, 
            skyboxSize: Math.max(150, (modelBoundingMax.subtract(modelBoundingMin)).length() * 2.5),
            enableGroundShadow: false,
          });
          scene.environmentIntensity = 1.0;

           if (sceneRef.current) { 
            if (effectiveTheme === 'light') {
                sceneRef.current.clearColor = new Color4(240 / 255, 240 / 255, 240 / 255, 1); 
            } else { 
                sceneRef.current.clearColor = new Color4(38 / 255, 38 / 255, 38 / 255, 1);   
            }
          }
        } else { 
          internalResetCameraAndEnvironment();
        }
      } else { 
        internalResetCameraAndEnvironment();
      }
    } else { 
      internalResetCameraAndEnvironment();
    }
  }, [internalResetCameraAndEnvironment, effectiveTheme, sceneRef]);


  useEffect(() => {
    if (requestFocusObject && isCurrentModelActuallyLoaded && onObjectFocused && cameraRef.current ) {
      focusOnLoadedModel();
      onObjectFocused();
    }
  }, [requestFocusObject, isCurrentModelActuallyLoaded, onObjectFocused, focusOnLoadedModel]);

  // Effect for applying mesh visibility based on hiddenMeshIds
  useEffect(() => {
    const scene = sceneRef.current;
    const container = loadedAssetContainerRef.current;

    if (!scene || !container || !isCurrentModelActuallyLoaded) return;

    container.meshes.forEach((mesh: AbstractMesh) => {
      if (!isHelperNodeByName(mesh.name)) { 
        const meshIdStr = mesh.uniqueId.toString();
        if (hiddenMeshIds && hiddenMeshIds.has(meshIdStr)) {
          mesh.setEnabled(false);
        } else {
          mesh.setEnabled(true);
        }
      }
    });
  }, [hiddenMeshIds, isCurrentModelActuallyLoaded, sceneRef]);


  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};
