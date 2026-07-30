import type { PromptStashImageFinalization } from "./promptStashStore";

export interface PromptStashFinalizationWarning {
  readonly title: string;
  readonly description: string;
}

function imageLabel(imageNames: ReadonlyArray<string>): string {
  return imageNames.length > 0 ? imageNames.join(", ") : "The stashed images";
}

export function promptStashFinalizationWarning(
  result: PromptStashImageFinalization,
): PromptStashFinalizationWarning | null {
  switch (result.status) {
    case "saved":
      return null;
    case "entry-missing":
      return {
        title: "Stashed images were not restored",
        description: `${imageLabel(result.imageNames)} finished saving after the stash was restored or deleted. Reattach the images if they are still needed.`,
      };
    case "images-dropped":
      return {
        title: "Stashed images were not saved",
        description: `${imageLabel(result.imageNames)} could not fit within stash limits or could not be read. The text remains stashed without those images.`,
      };
    case "persistence-failed":
      return {
        title: "Stashed images were not saved",
        description: `${imageLabel(result.imageNames)} could not be finalized in browser storage and cannot be recovered from the stash. Reattach the images if they are still needed.`,
      };
  }
}
