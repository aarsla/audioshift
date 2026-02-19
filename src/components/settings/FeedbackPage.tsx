import { useState } from "react";
import { Star, Send, MessageSquareHeart } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { SectionCard } from "./shared";

export default function FeedbackPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorText, setErrorText] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setStatus("sending");
    setErrorText("");

    try {
      const formData = new FormData();
      formData.append("access_key", "2bfe082d-3a78-435e-ac9e-e74509ea50a4");
      formData.append("subject", "Feedback from AudioShift app");
      formData.append("from_name", "AudioShift Feedback");
      if (email.trim()) formData.append("email", email.trim());
      formData.append("message", message.trim());

      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setStatus("sent");
        setEmail("");
        setMessage("");
      } else {
        setStatus("error");
        setErrorText("Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorText("Could not send feedback. Check your internet connection.");
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard title="We'd Love to Hear from You" icon={<MessageSquareHeart size={14} />}>
        <div className="py-3">
          <p className="text-sm text-muted-foreground">
            Your feedback helps us make AudioShift better. Whether it's a bug
            report, feature request, or just a kind word — we read every message.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="pb-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground" htmlFor="feedback-email">
              Email <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              id="feedback-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full h-8 px-3 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-foreground" htmlFor="feedback-message">
              Feedback
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what you think..."
              rows={4}
              required
              className="mt-1 w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          {status === "sent" && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Thank you! Your feedback has been sent.
            </p>
          )}
          {status === "error" && (
            <p className="text-xs text-red-600 dark:text-red-400">{errorText}</p>
          )}

          <button
            type="submit"
            disabled={!message.trim() || status === "sending"}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Send size={13} />
            {status === "sending" ? "Sending..." : "Send Feedback"}
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Support the Project" icon={<Star size={14} />}>
        <div className="py-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            If you enjoy AudioShift, a star on GitHub goes a long way!
          </p>
          <button
            onClick={() => openUrl("https://github.com/aarsla/audioshift")}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md bg-secondary border border-border hover:bg-accent text-foreground transition-colors"
          >
            <Star size={13} />
            Star on GitHub
          </button>
        </div>
      </SectionCard>
    </div>
  );
}
