import type { ComposerRichDraftFormat } from "../../fork/composerRichDraft";
import { Button } from "../ui/button";
import { BoldIcon, CodeIcon, ItalicIcon, LinkIcon, ListIcon } from "lucide-react";

interface ComposerRichDraftToolbarProps {
  disabled: boolean;
  onApplyFormat: (format: ComposerRichDraftFormat) => void;
}

const formatActions: Array<{
  format: ComposerRichDraftFormat;
  label: string;
  Icon: typeof BoldIcon;
}> = [
  { format: "bold", label: "Apply bold formatting", Icon: BoldIcon },
  { format: "italic", label: "Apply italic formatting", Icon: ItalicIcon },
  { format: "bullet-list", label: "Apply list formatting", Icon: ListIcon },
  { format: "link", label: "Insert link formatting", Icon: LinkIcon },
  { format: "code", label: "Apply code formatting", Icon: CodeIcon },
];

export function ComposerRichDraftToolbar({
  disabled,
  onApplyFormat,
}: ComposerRichDraftToolbarProps) {
  return (
    <div
      data-chat-composer-rich-draft-toolbar="true"
      className="inline-flex items-center gap-0.5 rounded-full border border-border/60 bg-muted/18 p-1 shadow-xs/5"
    >
      {formatActions.map(({ format, label, Icon }) => (
        <Button
          key={format}
          type="button"
          variant="ghost"
          size="icon-xs"
          className="rounded-full text-foreground/85 hover:bg-muted/45"
          onClick={() => onApplyFormat(format)}
          disabled={disabled}
          aria-label={label}
          title={label}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
    </div>
  );
}
