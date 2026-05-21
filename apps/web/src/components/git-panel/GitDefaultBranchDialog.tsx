import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";

interface GitDefaultBranchDialogCopy {
  title?: string;
  description?: string;
  continueLabel?: string;
}

interface GitDefaultBranchDialogProps {
  open: boolean;
  copy: GitDefaultBranchDialogCopy | null;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
  onCreateBranch: () => void;
}

export function GitDefaultBranchDialog({
  open,
  copy,
  onOpenChange,
  onContinue,
  onCreateBranch,
}: GitDefaultBranchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{copy?.title ?? "Continue on default branch?"}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:flex-wrap sm:items-center">
          <Button
            className="w-full sm:mr-auto sm:w-auto"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            className="min-h-8 w-full max-w-full whitespace-normal py-1.5 leading-snug sm:min-h-7 sm:w-auto"
            variant="outline"
            size="sm"
            onClick={onContinue}
          >
            {copy?.continueLabel ?? "Continue"}
          </Button>
          <Button
            className="min-h-8 w-full max-w-full whitespace-normal py-1.5 leading-snug sm:min-h-7 sm:w-auto"
            size="sm"
            onClick={onCreateBranch}
          >
            Feature branch
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
