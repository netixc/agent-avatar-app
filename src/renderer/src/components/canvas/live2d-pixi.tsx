/* eslint-disable no-shadow */
/* eslint-disable no-underscore-dangle */
/* eslint-disable @typescript-eslint/ban-ts-comment */
import { memo, useRef, useEffect } from "react";
import { useLive2DConfig } from "@/context/live2d-config-context";
import { useIpcHandlers } from "@/hooks/utils/use-ipc-handlers";
import { useInterrupt } from "@/hooks/utils/use-interrupt";
import { useAudioTask } from "@/hooks/utils/use-audio-task";
import { useLive2DModel } from "@/hooks/canvas/use-live2d-model-pixi";
import { useLive2DResize } from "@/hooks/canvas/use-live2d-resize-pixi";
import { useAiState, AiStateEnum } from "@/context/ai-state-context";
import { useForceIgnoreMouse } from "@/hooks/utils/use-force-ignore-mouse";
import { useMode } from "@/context/mode-context";

interface Live2DProps {
  showSidebar?: boolean;
}

export const Live2D = memo(
  ({ showSidebar }: Live2DProps): JSX.Element => {
    const { forceIgnoreMouse } = useForceIgnoreMouse();
    const { modelInfo } = useLive2DConfig();
    const { mode } = useMode();
    const { aiState } = useAiState();
    const isPet = mode === 'pet';

    // Initialize PIXI-based Live2D model
    const { canvasRef, appRef, modelRef, containerRef, isModelReady } = useLive2DModel({
      modelInfo,
    });

    // Setup resize handling
    useLive2DResize(containerRef, appRef, modelRef, modelInfo, isPet);

    // Setup hooks
    useIpcHandlers();
    useInterrupt();
    useAudioTask();

    // Reset expression to default when AI state becomes idle
    useEffect(() => {
      if (aiState === AiStateEnum.IDLE && modelRef.current && isModelReady) {
        if (modelInfo?.defaultEmotion !== undefined) {
          // Set default expression using PIXI Live2D API
          modelRef.current.internalModel.motionManager.expressionManager?.setExpression(
            modelInfo.defaultEmotion
          );
        } else {
          // Reset to neutral
          modelRef.current.internalModel.motionManager.expressionManager?.resetExpression();
        }
      }
    }, [aiState, modelInfo?.defaultEmotion, isModelReady]);

    // Expose model ref to window for debugging
    useEffect(() => {
      if (modelRef.current) {
        (window as any).live2dModel = modelRef.current;
        console.log('[Live2D] Model exposed to window.live2dModel for debugging');
      }
      return () => {
        delete (window as any).live2dModel;
      };
    }, [isModelReady]);

    const handleContextMenu = (e: React.MouseEvent) => {
      if (!isPet) {
        return;
      }

      e.preventDefault();
      console.log(
        "[ContextMenu] (Pet Mode) Right-click detected, requesting menu...",
      );
      window.api?.showContextMenu?.();
    };

    return (
      <div
        ref={containerRef}
        id="live2d-internal-wrapper"
        style={{
          width: "100%",
          height: "100%",
          pointerEvents: isPet && forceIgnoreMouse ? "none" : "auto",
          overflow: "hidden",
          position: "relative",
        }}
        onContextMenu={handleContextMenu}
      >
        <canvas
          id="canvas"
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            pointerEvents: isPet && forceIgnoreMouse ? "none" : "auto",
            display: "block",
          }}
        />
      </div>
    );
  },
);

Live2D.displayName = "Live2D";

export { useInterrupt, useAudioTask };
