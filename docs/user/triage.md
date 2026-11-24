# Triage an issue

Triage lets your own coding agent investigate a T3 Code problem. The agent
reads the logs and state of the machine, can check the exact-origin T3 Code
source for that version, finds known issues, and can help you write a good
GitHub issue. It asks before it clones source, applies a fix, or posts anything.

## In the app

Open the command palette and choose **Triage an issue**. A new thread with no
project opens, with the triage playbook linked in the message. Choose any
provider, describe what went wrong after the link, and send. T3 Code does not
download source on its own; the agent shows you the exact source and destination
and asks before it clones anything.

Triage runs on the machine of the thread or draft that you have open. With
nothing open, it uses your primary machine if that supports triage, or else the
first connected machine that does. The new thread shows the machine name, and on
mobile the palette row shows it before you start. If you change the machine
before you send, triage moves to that machine. The agent runs inside that T3
Code server, so it gives you any restart steps and does not do them itself.

## In a terminal

If the app does not start, or triage does not work in the app, run the
installed runtime on that machine:

```sh
t3 triage
```

It starts Claude Code, Codex, or Antigravity in your terminal with the same
instructions. If more than one is installed, it asks which to use. You can also
choose explicitly:

```sh
t3 triage --agent antigravity
t3 triage --agent codex
```

Antigravity needs Google's standalone `agy` CLI on your `PATH` and its own sign-in.
The ACP runtime installed through T3 Code does not include this terminal CLI.
Install it using [Google's CLI setup guide](https://antigravity.google/docs/cli-getting-started).
Pass `--model <model-id>` to choose a model, or leave it out to use the CLI's default.
