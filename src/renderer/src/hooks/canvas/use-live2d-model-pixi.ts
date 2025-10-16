/* eslint-disable no-use-before-define */
/* eslint-disable no-param-reassign */
import { useEffect, useRef, useCallback, useState } from "react";
import * as PIXI from "pixi.js";
import {
  Live2DModel,
  MotionPreloadStrategy,
  MotionPriority,
} from "pixi-live2d-display-lipsyncpatch";
import {
  ModelInfo,
  useLive2DConfig,
  TapMotionMap,
} from "@/context/live2d-config-context";
import { setModelSize, resetModelPosition } from "./use-live2d-resize-pixi";
import { useMode } from "@/context/mode-context";

// Register Cubism runtimes with PIXI Live2D
// This makes the globally loaded Live2D libraries available to pixi-live2d-display
if (typeof window !== 'undefined') {
  // @ts-ignore - Cubism 2 runtime
  if (window.Live2D) {
    // @ts-ignore
    window.PIXI = PIXI;
  }
  // @ts-ignore - Cubism 4 core
  if (window.Live2DCubismCore) {
    // Library is loaded globally via script tag
  }
}

interface UseLive2DModelProps {
  modelInfo: ModelInfo | undefined;
}

type MotionWeightMap = { [motionGroupName: string]: number };

export const useLive2DModel = ({
  modelInfo,
}: UseLive2DModelProps) => {
  const { mode } = useMode();
  const isPet = mode === 'pet';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const modelRef = useRef<Live2DModel | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const kScaleRef = useRef<string | number | undefined>(undefined);
  const { setIsLoading } = useLive2DConfig();
  const loadingRef = useRef(false);
  const [isModelReady, setIsModelReady] = useState(false);
  const electronApi = (window as any).electron;

  // Cleanup function for Live2D model
  const cleanupModel = useCallback(() => {
    if (modelRef.current) {
      modelRef.current.removeAllListeners();
      if (appRef.current) {
        appRef.current.stage.removeChild(modelRef.current);
        modelRef.current.destroy({
          children: true,
          texture: true,
          baseTexture: true,
        });
        PIXI.utils.clearTextureCache();
        modelRef.current = null;
      }
    }
    setIsModelReady(false);
  }, []);

  // Cleanup function for PIXI application
  const cleanupApp = useCallback(() => {
    if (appRef.current) {
      if (modelRef.current) {
        cleanupModel();
      }
      appRef.current.stage.removeChildren();
      PIXI.utils.clearTextureCache();
      appRef.current.renderer.clear();
      appRef.current.destroy(true, {
        children: true,
        texture: true,
        baseTexture: true,
      });
      PIXI.utils.destroyTextureCache();
      appRef.current = null;
    }
  }, [cleanupModel]);

  // Initialize PIXI application with canvas (only once)
  useEffect(() => {
    if (!appRef.current && canvasRef.current) {
      const app = new PIXI.Application({
        view: canvasRef.current,
        autoStart: true,
        width: window.innerWidth,
        height: window.innerHeight,
        backgroundAlpha: 0,
        antialias: true,
        clearBeforeRender: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      // Render on every frame
      app.ticker.add(() => {
        if (app.renderer) {
          app.renderer.render(app.stage);
        }
      });

      appRef.current = app;
    }

    return () => {
      cleanupApp();
    };
  }, [cleanupApp]);

  const setupModel = useCallback(
    async (model: Live2DModel) => {
      if (!appRef.current || !modelInfo) return;

      if (modelRef.current) {
        modelRef.current.removeAllListeners();
        appRef.current.stage.removeChild(modelRef.current);
        modelRef.current.destroy({
          children: true,
          texture: true,
          baseTexture: true,
        });
        PIXI.utils.clearTextureCache();
      }

      modelRef.current = model;
      appRef.current.stage.addChild(model);

      model.interactive = true;
      model.cursor = "pointer";
      setIsModelReady(true);
    },
    [modelInfo],
  );

  const setupModelSizeAndPosition = useCallback(() => {
    if (!modelRef.current) return;
    setModelSize(modelRef.current, kScaleRef.current);

    const { width, height } = isPet
      ? { width: window.innerWidth, height: window.innerHeight }
      : containerRef.current?.getBoundingClientRect() || {
        width: 0,
        height: 0,
      };

    resetModelPosition(modelRef.current, width, height, modelInfo?.initialXshift, modelInfo?.initialYshift);
  }, [isPet, modelInfo?.initialXshift, modelInfo?.initialYshift]);

  // Load Live2D model with configuration
  const loadModel = useCallback(async () => {
    if (!modelInfo?.url || !appRef.current) return;

    if (loadingRef.current) return;

    console.log("Loading model:", modelInfo.url);

    try {
      loadingRef.current = true;
      setIsLoading(true);

      // Initialize Live2D model with settings
      const model = await Live2DModel.from(modelInfo.url, {
        autoHitTest: true,
        autoFocus: modelInfo.pointerInteractive ?? false,
        autoUpdate: true,
        ticker: PIXI.Ticker.shared,
        motionPreload: MotionPreloadStrategy.IDLE,
        idleMotionGroup: modelInfo.idleMotionGroupName,
      });

      await setupModel(model);
    } catch (error) {
      console.error("Failed to load Live2D model:", error);
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [
    modelInfo?.url,
    modelInfo?.pointerInteractive,
    modelInfo?.idleMotionGroupName,
    setIsLoading,
    setupModel,
  ]);

  const setupModelInteractions = useCallback(
    (model: Live2DModel) => {
      if (!model) return;

      model.removeAllListeners("pointerenter");
      model.removeAllListeners("pointerleave");
      model.removeAllListeners("rightdown");
      model.removeAllListeners("pointerdown");
      model.removeAllListeners("pointermove");
      model.removeAllListeners("pointerup");
      model.removeAllListeners("pointerupoutside");

      let dragging = false;
      let pointerX = 0;
      let pointerY = 0;
      let isTap = false;
      const dragThreshold = 5;

      if (isPet && electronApi) {
        model.on("pointerenter", () => {
          electronApi.ipcRenderer?.send('update-component-hover', 'live2d-model', true);
        });

        model.on("pointerleave", () => {
          if (!dragging) {
            electronApi.ipcRenderer?.send('update-component-hover', 'live2d-model', false);
          }
        });

        model.on("rightdown", (e: any) => {
          e.data.originalEvent.preventDefault();
          electronApi.ipcRenderer?.send('show-context-menu');
        });
      }

      model.on("pointerdown", (e) => {
        if (e.button === 0) {
          dragging = true;
          isTap = true;
          pointerX = e.global.x - model.x;
          pointerY = e.global.y - model.y;
        }
      });

      model.on("pointermove", (e) => {
        if (dragging) {
          const newX = e.global.x - pointerX;
          const newY = e.global.y - pointerY;
          const dx = newX - model.x;
          const dy = newY - model.y;

          if (Math.hypot(dx, dy) > dragThreshold) {
            isTap = false;
          }

          model.position.x = newX;
          model.position.y = newY;
        }
      });

      model.on("pointerup", (e) => {
        if (dragging) {
          dragging = false;
          if (isTap) {
            handleTapMotion(model, e.global.x, e.global.y);
          }
        }
      });

      model.on("pointerupoutside", () => {
        dragging = false;
      });
    },
    [isPet, electronApi],
  );

  const handleTapMotion = useCallback(
    (model: Live2DModel, x: number, y: number) => {
      if (!modelInfo?.tapMotions) return;

      console.log("handleTapMotion", modelInfo?.tapMotions);
      // Convert global coordinates to model's local coordinates
      const localPos = model.toLocal(new PIXI.Point(x, y));
      const hitAreas = model.hitTest(localPos.x, localPos.y);

      const foundMotion = hitAreas.find((area) => {
        const motionGroup = modelInfo?.tapMotions?.[area];
        if (motionGroup) {
          console.log(`Found motion group for area ${area}:`, motionGroup);
          playRandomMotion(model, motionGroup);
          return true;
        }
        return false;
      });

      if (!foundMotion && Object.keys(modelInfo.tapMotions).length > 0) {
        const mergedMotions = getMergedMotionGroup(modelInfo.tapMotions);
        playRandomMotion(model, mergedMotions);
      }
    },
    [modelInfo?.tapMotions],
  );

  // Load model when URL changes and cleanup on unmount
  useEffect(() => {
    if (modelInfo?.url) {
      loadModel();
    }
    return () => {
      cleanupModel();
    };
  }, [modelInfo?.url, modelInfo?.pointerInteractive, loadModel, cleanupModel]);

  useEffect(() => {
    kScaleRef.current = modelInfo?.kScale;
  }, [modelInfo?.kScale]);

  useEffect(() => {
    setupModelSizeAndPosition();
  }, [isModelReady, setupModelSizeAndPosition]);

  useEffect(() => {
    if (modelRef.current && isModelReady) {
      setupModelInteractions(modelRef.current);
    }
  }, [isModelReady, setupModelInteractions]);

  return {
    canvasRef,
    appRef,
    modelRef,
    containerRef,
    isModelReady,
  };
};

const playRandomMotion = (model: Live2DModel, motionGroup: MotionWeightMap) => {
  if (!motionGroup || Object.keys(motionGroup).length === 0) return;

  const totalWeight = Object.values(motionGroup).reduce((sum, weight) => sum + weight, 0);
  let random = Math.random() * totalWeight;

  Object.entries(motionGroup).find(([motion, weight]) => {
    random -= weight;
    if (random <= 0) {
      console.log(`Playing weighted motion: ${motion} (weight: ${weight}/${totalWeight})`);
      model.motion(motion, undefined, MotionPriority.FORCE);
      return true;
    }
    return false;
  });
};

const getMergedMotionGroup = (
  tapMotions: TapMotionMap,
): MotionWeightMap => {
  const mergedMotions: {
    [key: string]: { total: number; count: number };
  } = {};

  Object.values(tapMotions)
    .flatMap((motionGroup) => Object.entries(motionGroup))
    .reduce((acc, [motion, weight]) => {
      if (!acc[motion]) {
        acc[motion] = { total: 0, count: 0 };
      }
      acc[motion].total += weight;
      acc[motion].count += 1;
      return acc;
    }, mergedMotions);

  return Object.entries(mergedMotions).reduce(
    (acc, [motion, { total, count }]) => ({
      ...acc,
      [motion]: total / count,
    }),
    {} as MotionWeightMap,
  );
};

// Export function for lip sync (to be called from outside)
export const playAudioWithLipSync = (audioBase64: string, volumes: number[]): Promise<void> => {
  return new Promise((resolve, reject) => {
    try {
      // Convert base64 to audio
      const audio = new Audio(`data:audio/wav;base64,${audioBase64}`);

      audio.addEventListener('canplaythrough', () => {
        audio.play().catch(reject);
      });

      audio.addEventListener('ended', () => {
        resolve();
      });

      audio.addEventListener('error', (e) => {
        reject(new Error(`Failed to play audio: ${e}`));
      });

      audio.load();
    } catch (error) {
      reject(error);
    }
  });
};
