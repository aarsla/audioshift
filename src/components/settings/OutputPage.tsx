import { useState } from "react";
import { ClipboardPaste, Eraser, X, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SectionCard, SettingRow } from "./shared";

const DEFAULT_FILLER_WORDS = [
  "um", "uh", "er", "ah", "eh", "umm", "uhh", "err", "ahh", "ehh",
  "hmm", "hm", "mm", "mmm", "erm", "urm", "ugh",
];

interface Props {
  pasteMode: "auto" | "clipboard";
  onPasteModeChange: (mode: "auto" | "clipboard") => void;
  removeFillerWords: boolean;
  fillerWords: string[];
  onRemoveFillerWordsChange: (enabled: boolean) => void;
  onFillerWordsChange: (words: string[]) => void;
}

export default function OutputPage({
  pasteMode,
  onPasteModeChange,
  removeFillerWords,
  fillerWords,
  onRemoveFillerWordsChange,
  onFillerWordsChange,
}: Props) {
  const [newWord, setNewWord] = useState("");

  const addWord = () => {
    const word = newWord.trim().toLowerCase();
    if (word && !fillerWords.includes(word)) {
      onFillerWordsChange([...fillerWords, word]);
    }
    setNewWord("");
  };

  const removeWord = (word: string) => {
    onFillerWordsChange(fillerWords.filter((w) => w !== word));
  };

  const resetWords = () => {
    onFillerWordsChange([...DEFAULT_FILLER_WORDS]);
  };

  const isDefault =
    fillerWords.length === DEFAULT_FILLER_WORDS.length &&
    DEFAULT_FILLER_WORDS.every((w) => fillerWords.includes(w));

  return (
    <div className="space-y-4">
      <SectionCard title="Paste Behavior" icon={<ClipboardPaste size={14} />}>
        <SettingRow
          label="Auto-paste"
          description="Automatically paste transcribed text into the active app"
          note={
            pasteMode === "auto"
              ? `Copies text and simulates ${navigator.userAgent.includes("Mac") ? "\u2318V" : "Ctrl+V"}`
              : `You paste manually with ${navigator.userAgent.includes("Mac") ? "\u2318V" : "Ctrl+V"}`
          }
        >
          <Switch
            checked={pasteMode === "auto"}
            onCheckedChange={(checked) =>
              onPasteModeChange(checked ? "auto" : "clipboard")
            }
          />
        </SettingRow>
      </SectionCard>

      <SectionCard title="Text Cleanup" icon={<Eraser size={14} />}>
        <SettingRow
          label="Remove filler words"
          description="Automatically remove filler sounds like 'um', 'uh', 'er' from transcriptions"
        >
          <Switch
            checked={removeFillerWords}
            onCheckedChange={onRemoveFillerWordsChange}
          />
        </SettingRow>

        {removeFillerWords && (
          <div className="pb-4 -mt-1">
            <div className="flex flex-wrap gap-1.5 mb-3">
              {fillerWords.map((word) => (
                <span
                  key={word}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-xs text-foreground border border-border"
                >
                  {word}
                  <button
                    onClick={() => removeWord(word)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); addWord(); }
                }}
                placeholder="Add word..."
                className="flex-1 h-7 px-2 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button
                onClick={addWord}
                disabled={!newWord.trim()}
                className="h-7 px-2.5 text-xs rounded-md bg-secondary border border-border hover:bg-accent text-muted-foreground transition-colors disabled:opacity-50"
              >
                Add
              </button>
              {!isDefault && (
                <button
                  onClick={resetWords}
                  className="h-7 px-2.5 text-xs rounded-md bg-secondary border border-border hover:bg-accent text-muted-foreground transition-colors flex items-center gap-1"
                >
                  <RotateCcw size={11} />
                  Reset
                </button>
              )}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
