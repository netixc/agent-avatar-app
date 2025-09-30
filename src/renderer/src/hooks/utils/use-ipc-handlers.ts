import { useEffect, useCallback } from "react";
import { useInterrupt } from "@/components/canvas/live2d";
import { useMicToggle } from "./use-mic-toggle";
import { useLive2DConfig } from "@/context/live2d-config-context";
import { useSwitchCharacter } from "@/hooks/utils/use-switch-character";

export function useIpcHandlers({ isPet }: { isPet: boolean }) {
  const { handleMicToggle } = useMicToggle();
  const { interrupt } = useInterrupt();
  const { modelInfo, setModelInfo } = useLive2DConfig();
  const { switchCharacter } = useSwitchCharacter();

  const micToggleHandler = useCallback(() => {
    handleMicToggle();
  }, [handleMicToggle]);

  const interruptHandler = useCallback(() => {
    interrupt();
  }, [interrupt]);

  const scrollToResizeHandler = useCallback(() => {
    if (modelInfo) {
      setModelInfo({
        ...modelInfo,
        scrollToResize: !modelInfo.scrollToResize,
      });
    }
  }, [modelInfo, setModelInfo]);

  const switchCharacterHandler = useCallback(
    (_event: Electron.IpcRendererEvent, filename: string) => {
      switchCharacter(filename);
    },
    [switchCharacter],
  );

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;
    if (!isPet) return;

    window.electron.ipcRenderer.removeAllListeners("mic-toggle");
    window.electron.ipcRenderer.removeAllListeners("interrupt");
    window.electron.ipcRenderer.removeAllListeners("toggle-scroll-to-resize");
    window.electron.ipcRenderer.removeAllListeners("switch-character");

    window.electron.ipcRenderer.on("mic-toggle", micToggleHandler);
    window.electron.ipcRenderer.on("interrupt", interruptHandler);
    window.electron.ipcRenderer.on(
      "toggle-scroll-to-resize",
      scrollToResizeHandler,
    );
    window.electron.ipcRenderer.on("switch-character", switchCharacterHandler);

    return () => {
      window.electron?.ipcRenderer.removeAllListeners("mic-toggle");
      window.electron?.ipcRenderer.removeAllListeners("interrupt");
      window.electron?.ipcRenderer.removeAllListeners(
        "toggle-scroll-to-resize",
      );
      window.electron?.ipcRenderer.removeAllListeners("switch-character");
    };
  }, [
    micToggleHandler,
    interruptHandler,
    scrollToResizeHandler,
    switchCharacterHandler,
    isPet,
  ]);
}
