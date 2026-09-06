import { BOARD_CURSOR_MAX_LENGTH, BoardPostId, type BoardPost } from "@t3tools/contracts";
import * as Predicate from "effect/Predicate";

export interface BoardPageCursor {
  readonly sequence: number;
  readonly postId: BoardPost["id"];
}

export function encodeBoardPageCursor(cursor: BoardPageCursor): string {
  return Buffer.from(JSON.stringify({ s: cursor.sequence, i: cursor.postId })).toString(
    "base64url",
  );
}

export function encodeBoardPostCursor(post: BoardPost): string {
  return encodeBoardPageCursor({ sequence: post.sequence, postId: post.id });
}

export function decodeBoardPageCursor(encoded: string): BoardPageCursor | null {
  if (encoded.length > BOARD_CURSOR_MAX_LENGTH) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !Predicate.isObject(parsed) ||
    typeof parsed.s !== "number" ||
    !Number.isSafeInteger(parsed.s) ||
    parsed.s < 0 ||
    typeof parsed.i !== "string" ||
    parsed.i.trim().length === 0 ||
    parsed.i.length > 512
  ) {
    return null;
  }
  return {
    sequence: parsed.s,
    postId: BoardPostId.make(parsed.i),
  };
}
