# Poteto Mode

Click the P to the right of the permission lock at the top right of the expanded composer to turn Poteto Mode on or off. In compact layouts, the P stays in the composer toolbar. The P appears lighter with a highlighted background when it is on. While on, each ordinary message invokes the Poteto workflow without needing to type the skill name. The leading invocation line is hidden in chat history while still being sent to the agent.

The choice stays on for this thread across sends, draft clearing, navigation and reload on this client. Other threads start off. A new thread created to implement a plan inherits the choice. Turning it off stops adding the invocation; it does not cancel work already running or end a workflow already active in the conversation.

Poteto Mode supports Codex with the Poteto Mode skill installed and one model selected. If the skill disappears or you switch providers, turn the mode off or restore the original selection before sending an ordinary task. Slash commands and answers to pending questions keep their usual behavior. Mode choices do not synchronize between devices, and the native mobile composer does not yet have the toggle.

You can also invoke the workflow directly:

```text
$poteto-mode users get duplicate notifications after retry. Reproduce, fix, and show failing-then-passing proof.
```

Give a symptom, feature, question or longer task without naming a playbook. Add a finish condition, known facts, requested evidence and real constraints when they matter. `Don't change code yet` keeps the work read-only. `Plan only` produces a plan for review.

The skill matches the goal to one of the guide's 23 adapted playbooks or a bespoke run. It shows the chosen route, copies the steps into the plan, keeps skipped steps visible and checks the result against the actual artifact. T3 delegation and wakeups supply the available orchestration.

Say `continue` for the same task, `new task` to route a different goal, or explicitly exit the workflow. If the P is still on, turn it off to stop invoking the workflow on later messages.

```text
$poteto-mode new task. Explain why this cache survives logout. Don't change code yet.
```

The skill uses existing task permissions. A build request does not automatically publish a PR, merge, prune worktrees or create recurring work. Model compliance remains something to evaluate on real goals.
