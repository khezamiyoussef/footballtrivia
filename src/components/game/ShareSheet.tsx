import type { ReactNode } from "react";
import { Facebook, Link2, Linkedin, Mail, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type Target = { name: string; color: string; icon: ReactNode; href: (text: string, url: string) => string };

const e = encodeURIComponent;

// Each network's public "share" page, prefilled with the message and link.
const TARGETS: Target[] = [
  { name: "WhatsApp", color: "#25D366", icon: <MessageCircle />, href: (t, u) => `https://wa.me/?text=${e(`${t} ${u}`)}` },
  { name: "X", color: "#111111", icon: <span className="font-display text-xl leading-none">X</span>, href: (t, u) => `https://x.com/intent/post?text=${e(t)}&url=${e(u)}` },
  { name: "Facebook", color: "#1877F2", icon: <Facebook />, href: (_t, u) => `https://www.facebook.com/sharer/sharer.php?u=${e(u)}` },
  { name: "Telegram", color: "#229ED9", icon: <Send />, href: (t, u) => `https://t.me/share/url?url=${e(u)}&text=${e(t)}` },
  { name: "Reddit", color: "#FF4500", icon: <span className="font-display text-xl leading-none">r/</span>, href: (t, u) => `https://www.reddit.com/submit?url=${e(u)}&title=${e(t)}` },
  { name: "LinkedIn", color: "#0A66C2", icon: <Linkedin />, href: (_t, u) => `https://www.linkedin.com/sharing/share-offsite/?url=${e(u)}` },
  { name: "Email", color: "#6b5671", icon: <Mail />, href: (t, u) => `mailto:?subject=${e("My Five-a-Side picks")}&body=${e(`${t}\n\n${u}`)}` },
];

/** Share panel for computers: one tap opens the chosen network's share page in a new tab. */
export function ShareSheet({ open, onOpenChange, text, url }: { open: boolean; onOpenChange: (o: boolean) => void; text: string; url: string }) {
  async function copy() {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  const tile = "flex flex-col items-center gap-1.5 rounded-xl p-2 text-xs font-semibold text-foreground transition-transform hover:-translate-y-0.5";
  const badge = "flex size-12 items-center justify-center rounded-full border-2 border-border text-white shadow-[2px_2px_0_var(--border)] [&_svg]:size-5";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ticket max-w-sm bg-card">
        <DialogTitle className="display-xl text-3xl">Share your picks</DialogTitle>
        <DialogDescription>Send your ticket to friends and see who calls it better.</DialogDescription>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {TARGETS.map((t) => (
            <a key={t.name} href={t.href(text, url)} target="_blank" rel="noopener noreferrer" className={tile} onClick={() => onOpenChange(false)}>
              <span className={badge} style={{ backgroundColor: t.color }} aria-hidden>{t.icon}</span>
              {t.name}
            </a>
          ))}
          <button type="button" onClick={copy} className={tile}>
            <span className={`${badge} bg-gold text-foreground`} aria-hidden><Link2 /></span>
            Copy link
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
