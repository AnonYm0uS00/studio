
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
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF'; // For GLTF/GLB support
import '@babylonjs/loaders/OBJ';  // For OBJ support
// FBX support was removed due to import issues.

interface BabylonViewerProps {
  modelUrl: string | null; // Can now be a Data URL or an http(s) URL
  onModelLoaded: (success: boolean, error?: string) => void;
  onCameraReady: (camera: ArcRotateCamera) => void;
}

export const BabylonViewer: React.FC<BabylonViewerProps> = ({ modelUrl, onModelLoaded, onCameraReady }) => {
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
    camera.upperRadiusLimit = 1000;
    onCameraReady(camera);

    new HemisphericLight("light1", new Vector3(1, 1, 0), scene);
    new HemisphericLight("light2", new Vector3(-1, -1, -0.5), scene);


    engine.runRenderLoop(() => {
      if (sceneRef.current) {
        sceneRef.current.render();
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
       // Clean up asset container on component unmount or before loading new model
      if (loadedAssetContainerRef.current) {
        loadedAssetContainerRef.current.dispose();
        loadedAssetContainerRef.current = null;
      }
    };
  }, [onCameraReady]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // Dispose previous model
    if (loadedAssetContainerRef.current) {
      loadedAssetContainerRef.current.dispose();
      loadedAssetContainerRef.current = null;
    }
    
    // If modelUrl is null (e.g. no file selected yet, or file cleared), clear the scene and reset camera
    if (!modelUrl) {
        const camera = scene.activeCamera as ArcRotateCamera;
        if (camera) {
            camera.target = Vector3.Zero();
            camera.radius = 10;
            camera.alpha = -Math.PI / 2;
            camera.beta = Math.PI / 2.5;
        }
        // Call onModelLoaded with success:true but no model to clear any previous error states in parent
        onModelLoaded(true, undefined); 
        return;
    }

    // Determine if the modelUrl is a Data URL
    const isDataUrl = modelUrl.startsWith('data:');
    const rootUrl = isDataUrl ? "" : modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1);
    
    // For Data URLs, the file extension needs to be hinted for some loaders (especially OBJ with MTLs)
    // However, LoadAssetContainerAsync usually infers this well.
    // We pass an empty string for the scene filename when it's a Data URL.
    const sceneFilename = isDataUrl ? "" : undefined;

    SceneLoader.LoadAssetContainerAsync(rootUrl, modelUrl, scene, undefined, sceneFilename ? undefined : ".glb") // Provide a hint if no filename from URL
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
            camera.radius = Math.max(distance * 1.5, 1); 
          } else {
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
        // Try to give a more specific error for common issues
        if (modelUrl.includes('.obj') && !isDataUrl) { // check includes for data URLs
             userMessage += " For OBJ files, ensure any .mtl material files and textures are accessible (usually in the same directory or correctly referenced).";
        }

        onModelLoaded(false, userMessage);
      });

  }, [modelUrl, onModelLoaded, sceneRef]); // Ensure sceneRef is a dependency if its current value is used

  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};
    
