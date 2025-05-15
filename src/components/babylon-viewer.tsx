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

interface BabylonViewerProps {
  modelUrl: string | null;
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

    if (!modelUrl) {
        // If modelUrl is null, clear the scene (already handled by disposing above)
        // and ensure camera is reset or in a default state if needed.
        const camera = scene.activeCamera as ArcRotateCamera;
        if (camera) {
            camera.target = Vector3.Zero();
            camera.radius = 10;
            camera.alpha = -Math.PI / 2;
            camera.beta = Math.PI / 2.5;
        }
        return;
    }


    SceneLoader.LoadAssetContainerAsync(modelUrl, "", scene)
      .then(container => {
        loadedAssetContainerRef.current = container;
        container.addAllToScene();
        
        if (container.meshes.length > 0 && scene.activeCamera) {
          const camera = scene.activeCamera as ArcRotateCamera;
          
          // Calculate bounding box for all meshes in the container
          let min = new Vector3(Infinity, Infinity, Infinity);
          let max = new Vector3(-Infinity, -Infinity, -Infinity);

          container.meshes.forEach((mesh) => {
            // Ensure world matrix is computed before getting bounding info
            mesh.computeWorldMatrix(true); 
            const boundingInfo = mesh.getBoundingInfo();
            if (boundingInfo) {
              const meshMin = boundingInfo.boundingBox.minimumWorld;
              const meshMax = boundingInfo.boundingBox.maximumWorld;
              min = Vector3.Minimize(min, meshMin);
              max = Vector3.Maximize(max, meshMax);
            }
          });
          
          if (min.x !== Infinity) { // Check if any bounding box was found
            const center = Vector3.Center(min, max);
            camera.setTarget(center);

            const distance = Vector3.Distance(min, max);
            camera.radius = Math.max(distance * 1.5, 1); // Ensure radius is not too small
          } else {
            // Fallback if no bounding info (e.g. empty meshes)
             camera.setTarget(Vector3.Zero());
             camera.radius = 10;
          }
        }
        onModelLoaded(true);
      })
      .catch(error => {
        console.error("Error loading model:", error);
        onModelLoaded(false, error.message || "Unknown error during model loading.");
      });

  }, [modelUrl, onModelLoaded]);

  return <canvas ref={canvasRef} className="w-full h-full outline-none" touch-action="none" />;
};
