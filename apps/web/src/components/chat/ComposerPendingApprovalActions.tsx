import { type ApprovalRequestId, type ProviderApprovalDecision } from "@t3tools/contracts";
import { memo } from "react";
import { Button } from "../ui/button";

interface ComposerPendingApprovalActionsProps {
  requestId: ApprovalRequestId;
  isResponding: boolean;
  isUnavailable: boolean;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  isResponding,
  isUnavailable,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  const disabled = isResponding || isUnavailable;
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={() => void onRespondToApproval(requestId, "cancel")}
      >
        Cancel turn
      </Button>
      <Button
        size="sm"
        variant="destructive-outline"
        disabled={disabled}
        onClick={() => void onRespondToApproval(requestId, "decline")}
      >
        Decline
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => void onRespondToApproval(requestId, "acceptForSession")}
      >
        Always allow this session
      </Button>
      <Button
        size="sm"
        variant="default"
        disabled={disabled}
        onClick={() => void onRespondToApproval(requestId, "accept")}
      >
        Approve once
      </Button>
    </>
  );
});
