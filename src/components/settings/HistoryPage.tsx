import { Clock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SectionCard, SettingRow } from "./shared";

interface Props {
  saveHistory: boolean;
  onSaveHistoryChange: (enabled: boolean) => void;
}

export default function HistoryPage({ saveHistory, onSaveHistoryChange }: Props) {
  return (
    <div className="space-y-4">
      <SectionCard title="Recording" icon={<Clock size={14} />}>
        <SettingRow
          label="Save History"
          description="Save transcriptions and audio recordings to disk"
        >
          <Switch checked={saveHistory} onCheckedChange={onSaveHistoryChange} />
        </SettingRow>
      </SectionCard>
    </div>
  );
}
