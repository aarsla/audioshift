import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  AudioWaveform,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Keyboard,
  Loader2,
  Mic,
  TriangleAlert,
} from "lucide-react";

interface OnboardingStatus {
  model_ready: boolean;
  mic_granted: boolean;
  paste_granted: boolean;
}

interface DownloadProgress {
  file: string;
  progress: number;
  downloaded?: number;
  total?: number;
  overall_downloaded?: number;
  overall_total?: number;
  overall_progress?: number;
}

interface ModelInfo {
  id: string;
  name: string;
  engine: string;
  description: string;
  sizeLabel: string;
  ready: boolean;
  diskSize: number;
  path: string;
}

const isMac = navigator.userAgent.includes("Mac");
const STEPS = isMac
  ? (["Welcome", "Model", "Microphone", "Paste Permission", "Ready"] as const)
  : (["Welcome", "Model", "Ready"] as const);

function formatMB(bytes: number): string {
  return Math.round(bytes / (1024 * 1024)).toString();
}

function shortcutDisplay(shortcut: string): string {
  if (navigator.userAgent.includes("Mac")) {
    return shortcut
      .replace("CmdOrCtrl", "\u2318")
      .replace("Cmd", "\u2318")
      .replace("Ctrl", "\u2303")
      .replace("Shift", "\u21E7")
      .replace("Alt", "\u2325")
      .replace("Space", "Space")
      .replace(/\+/g, "");
  }
  return shortcut.replace(/\+/g, " + ");
}

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<OnboardingStatus>({
    model_ready: false,
    mic_granted: false,
    paste_granted: false,
  });
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModelId, setSelectedModelId] = useState("parakeet-tdt-0.6b-v3");
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [hotkey, setHotkey] = useState(isMac ? "Alt+Space" : "Ctrl+Shift+Space");
  const [testState, setTestState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [testResult, setTestResult] = useState("");
  const downloadStarted = useRef(false);

  const selectedModel = models.find((m) => m.id === selectedModelId);

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
    invoke("set_live_model", { modelId });
  };

  // 1. Listen for download progress
  useEffect(() => {
    const unlisten = listen<DownloadProgress>("model-download-progress", (event) => {
      const data = event.payload;
      if (data.file === "complete") {
        setProgress(null);
        setDownloadError(null);
        setStatus((s) => ({ ...s, model_ready: true }));
        invoke<ModelInfo[]>("get_all_models_status").then(setModels);
      } else {
        setProgress(data);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // 2. Check status and load models + saved live model
  useEffect(() => {
    const init = async () => {
      const [s, hk, allModels, savedModel] = await Promise.all([
        invoke<OnboardingStatus>("check_onboarding_needed"),
        invoke<string>("get_current_hotkey"),
        invoke<ModelInfo[]>("get_all_models_status"),
        invoke<string>("get_live_model"),
      ]);
      setStatus(s);
      setHotkey(hk);
      setModels(allModels);
      setSelectedModelId(savedModel);
    };
    init();
  }, []);

  // Recheck status when window regains focus
  useEffect(() => {
    const win = getCurrentWebviewWindow();
    const unlisten = win.onFocusChanged(({ payload: focused }) => {
      if (focused) {
        invoke<OnboardingStatus>("check_onboarding_needed").then(setStatus);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Poll status on permission steps and Ready as backup for system settings changes
  useEffect(() => {
    const currentStep = STEPS[step];
    if (currentStep !== "Microphone" && currentStep !== "Paste Permission" && currentStep !== "Ready") return;
    const interval = setInterval(async () => {
      const s = await invoke<OnboardingStatus>("check_onboarding_needed");
      setStatus(s);
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const startDownload = async () => {
    if (downloadStarted.current) return;
    downloadStarted.current = true;
    setDownloadError(null);

    const model = models.find((m) => m.id === selectedModelId);
    const approxBytes = model?.diskSize || 680_000_000;

    try { await invoke("delete_model", { modelId: selectedModelId }); } catch {}
    setProgress({ file: "starting", progress: 0, overall_progress: 0, overall_downloaded: 0, overall_total: approxBytes });

    try {
      await invoke("download_model", { modelId: selectedModelId });
    } catch (e) {
      setDownloadError(String(e));
      setProgress(null);
      downloadStarted.current = false;
    }
  };

  const retryDownload = async () => {
    downloadStarted.current = false;
    setDownloadError(null);
    startDownload();
  };

  const lastStep = STEPS.length - 1;

  // Listen for status changes and transcription result on the Ready step
  useEffect(() => {
    if (step !== lastStep) return;
    const unlistenStatus = listen<string>("status-changed", (event) => {
      const s = event.payload;
      if (s === "recording") setTestState("recording");
      else if (s === "transcribing") setTestState("transcribing");
      else if (s === "idle") setTestState("idle");
    });
    const unlistenResult = listen<string>("transcription-complete", (event) => {
      if (event.payload) setTestResult(event.payload);
    });
    return () => {
      unlistenStatus.then((fn) => fn());
      unlistenResult.then((fn) => fn());
    };
  }, [step]);

  const closeWindow = async () => {
    await invoke("set_live_model", { modelId: selectedModelId });
    // Hide immediately, then let Rust destroy after WebKit's pending run loop tasks drain.
    // Calling window.close() from JS triggers immediate WebPageProxy destruction, which
    // causes SIGSEGV in dispatchSetObscuredContentInsets on macOS 26.
    getCurrentWebviewWindow().hide();
    invoke("complete_onboarding");
  };

  const isDownloading = progress != null;
  const overallPct = progress?.overall_progress ?? 0;
  const overallDl = progress?.overall_downloaded ?? 0;
  const overallTotal = progress?.overall_total ?? 680_000_000;
  const currentFile = progress?.file && progress.file !== "starting" ? progress.file : null;

  return (
    <div className="h-screen flex flex-col bg-background text-foreground select-none overflow-hidden">
      {/* Drag region */}
      <div className="h-8 shrink-0" data-tauri-drag-region />

      {/* Content */}
      <div className="flex-1 flex flex-col px-10 pb-6 min-h-0">
        {/* Step content */}
        <div className="flex-1 flex flex-col min-h-0">
          {STEPS[step] === "Welcome" && (
            <div className="flex-1 flex flex-col justify-center space-y-4 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <AudioWaveform size={32} className="text-primary" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Welcome to AudioShift</h1>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                  Local voice-to-text transcription. Press a shortcut, speak, and your words appear as text — all processed on your device.
                </p>
              </div>
              <p className="text-xs text-muted-foreground/70">
                Let's get you set up in a few quick steps.
              </p>
            </div>
          )}

          {STEPS[step] === "Model" && (
            <div className="flex-1 flex flex-col pt-4">
              {/* Header */}
              <div className="text-center mb-6">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Download size={24} className="text-primary" />
                  </div>
                </div>
                <h2 className="text-xl font-semibold tracking-tight">Speech Model</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose a model for local transcription.
                </p>
              </div>

              {/* Content */}
              <div className="space-y-3">
                {/* Model selector + action */}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 min-w-0">
                    <select
                      value={selectedModelId}
                      onChange={(e) => handleModelChange(e.target.value)}
                      disabled={isDownloading}
                      className="w-full appearance-none bg-card border border-border rounded-xl px-4 py-2.5 pr-9 text-sm text-foreground cursor-pointer hover:border-primary/40 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} (~{m.sizeLabel}){m.ready ? " \u2713" : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
                    />
                  </div>

                  {selectedModel?.ready ? (
                    <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                      <Check size={14} className="text-emerald-500" />
                      <span className="text-sm text-emerald-600 dark:text-emerald-400">Ready</span>
                    </div>
                  ) : isDownloading ? (
                    <div className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-card border border-border shrink-0">
                      <Loader2 size={14} className="animate-spin text-primary" />
                      <span className="text-sm font-mono text-foreground">{overallPct}%</span>
                    </div>
                  ) : (
                    <button
                      onClick={startDownload}
                      className="flex items-center gap-1.5 px-4 py-2.5 text-sm rounded-xl shrink-0
                                 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      <Download size={14} />
                      Download
                    </button>
                  )}
                </div>

                {/* Description */}
                {selectedModel && !isDownloading && !downloadError && (
                  <p className="text-xs text-muted-foreground text-center">
                    {selectedModel.description}
                  </p>
                )}

                {/* Download progress */}
                {isDownloading && (
                  <div className="space-y-1.5">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${Math.max(overallPct, 1)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground text-center">
                      {formatMB(overallDl)} / ~{formatMB(overallTotal)} MB{currentFile ? ` — ${currentFile}` : ""}
                    </p>
                  </div>
                )}

                {/* Download error */}
                {downloadError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
                    <TriangleAlert size={14} className="text-destructive shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">Download failed</p>
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">{downloadError}</p>
                      <button
                        onClick={retryDownload}
                        className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg
                                   bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <Download size={12} />
                        Retry
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {STEPS[step] === "Microphone" && (
            <div className="flex-1 flex flex-col pt-2">
              {/* Header */}
              <div className="text-center mb-5">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Mic size={24} className="text-primary" />
                  </div>
                </div>
                <h2 className="text-xl font-semibold tracking-tight">Microphone Access</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  AudioShift needs microphone access to capture your voice.
                </p>
              </div>

              {/* Content */}
              {status.mic_granted ? (
                <div className="flex items-center gap-2.5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <Check size={18} className="text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Microphone access granted</p>
                    <p className="text-xs text-muted-foreground">You're all set.</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-card border border-border text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    Click the button below to grant microphone access.
                  </p>
                  <button
                    onClick={() => invoke("request_microphone_permission")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg
                               bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Mic size={14} />
                    Grant Microphone Access
                  </button>
                  <p className="text-[11px] text-muted-foreground/50 mt-3">
                    Updates automatically once access is granted.
                  </p>
                </div>
              )}
            </div>
          )}

          {STEPS[step] === "Paste Permission" && (
            <div className="flex-1 flex flex-col pt-2">
              {/* Header */}
              <div className="text-center mb-5">
                <div className="flex justify-center mb-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Keyboard size={24} className="text-primary" />
                  </div>
                </div>
                <h2 className="text-xl font-semibold tracking-tight">Paste Permission</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  AudioShift needs permission to paste transcribed text into your apps.
                </p>
              </div>

              {/* Content */}
              {status.paste_granted ? (
                <div className="flex items-center gap-2.5 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <Check size={18} className="text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Paste permission granted</p>
                    <p className="text-xs text-muted-foreground">You're all set.</p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-card border border-border text-center">
                  <p className="text-sm text-muted-foreground mb-3">
                    Click the button below to grant paste permission. You may need to toggle AudioShift in System Settings.
                  </p>
                  <button
                    onClick={() => invoke("request_paste_permission")}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg
                               bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <Keyboard size={14} />
                    Grant Paste Permission
                  </button>
                  <p className="text-[11px] text-muted-foreground/50 mt-3">
                    Updates automatically once access is granted.
                  </p>
                </div>
              )}
            </div>
          )}

          {STEPS[step] === "Ready" && (
            <div className="flex-1 flex flex-col pt-2">
              {/* Header */}
              <div className="text-center mb-4">
                <h2 className="text-2xl font-semibold tracking-tight">You're all set!</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Try it out — press the shortcut and say something.
                </p>
              </div>

              {/* Hotkey card */}
              <div className="flex justify-center mb-4">
                <div className="px-5 py-3 rounded-xl bg-card border border-border text-center">
                  <kbd className="text-lg font-mono font-semibold text-foreground tracking-wide">
                    {shortcutDisplay(hotkey)}
                  </kbd>
                  <p className="text-[11px] text-muted-foreground mt-1">press anywhere to record</p>
                </div>
              </div>

              {/* Test area */}
              <div className="flex-1 flex flex-col justify-center min-h-[80px]">
                {testState === "idle" && !testResult && (
                  <p className="text-xs text-muted-foreground/50 text-center">
                    Press the shortcut to test recording
                  </p>
                )}

                {testState === "recording" && (
                  <div className="flex items-center justify-center gap-2 text-sm text-red-500">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    Listening... press <kbd className="px-1.5 py-0.5 rounded bg-muted font-mono text-xs text-foreground">{shortcutDisplay(hotkey)}</kbd> to stop
                  </div>
                )}

                {testState === "transcribing" && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" /> Transcribing...
                  </div>
                )}

                {testState === "idle" && testResult && (
                  <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 mx-auto max-w-full">
                    <p className="text-sm text-foreground text-center italic">"{testResult}"</p>
                  </div>
                )}
              </div>

              {/* Status row — compact horizontal */}
              <div className="flex items-center justify-center gap-4 pt-2">
                <StatusDot label="Model" ok={status.model_ready} />
                {isMac && <StatusDot label="Microphone" ok={status.mic_granted} />}
                {isMac && <StatusDot label="Paste" ok={status.paste_granted} />}
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="shrink-0 pt-4 border-t border-border">
          {step === 0 ? (
            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i === step ? "bg-primary" : "bg-muted-foreground/20"
                    }`}
                  />
                ))}
              </div>
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-5 py-2 text-sm rounded-lg
                           bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Get Started
                <ChevronRight size={14} />
              </button>
            </div>
          ) : step < lastStep ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {STEPS.map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${
                      i === step ? "bg-primary" : i < step ? "bg-primary/40" : "bg-muted-foreground/20"
                    }`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg
                             text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronLeft size={14} />
                  Back
                </button>
                <button
                  onClick={() => setStep(step + 1)}
                  className="flex items-center gap-1.5 px-5 py-2 text-sm rounded-lg
                             bg-primary text-primary-foreground hover:bg-primary/90
                             transition-colors"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <button
                onClick={closeWindow}
                className="inline-flex items-center gap-1.5 px-6 py-2.5 text-sm rounded-lg
                           bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Start Using AudioShift
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusDot({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? "bg-emerald-500" : "bg-amber-500"}`} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
