#!/usr/bin/env python3

import importlib.util
import pathlib
import signal


MODULE_PATH = pathlib.Path(__file__).with_name(
    "desktop-artifact-process-supervisor.py"
)
SPEC = importlib.util.spec_from_file_location(
    "desktop_artifact_process_supervisor", MODULE_PATH
)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Unable to load the desktop artifact process supervisor.")
SUPERVISOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUPERVISOR)


def test_pidfd_capture_rejects_reused_pid():
    old_identity = (101, 100, 700, "old-start")
    closed_pidfds = []
    original_close = SUPERVISOR.os.close
    SUPERVISOR.os.close = lambda pidfd: closed_pidfds.append(pidfd)
    try:
        captured_processes = {}
        SUPERVISOR.capture_descendant_processes(
            100,
            captured_processes,
            identities=[
                (100, 1, 100, "supervisor-start"),
                old_identity,
            ],
            pidfd_open=lambda _pid, _flags: 41,
            read_identity=lambda _pid: (101, 1, 700, "new-start"),
        )
    finally:
        SUPERVISOR.os.close = original_close

    assert captured_processes == {}
    assert closed_pidfds == [41]


def test_signals_exact_captured_pidfds():
    captured_processes = {
        (101, "old-start"): 41,
        (303, "stable-start"): 42,
    }
    sent = []

    SUPERVISOR.signal_captured_processes(
        captured_processes,
        signal.SIGKILL,
        pidfd_send_signal=lambda pidfd, requested_signal: sent.append(
            (pidfd, requested_signal)
        ),
    )

    assert sent == [(41, signal.SIGKILL), (42, signal.SIGKILL)]


def test_capture_excludes_supervisor_identity():
    captured_processes = {}
    identities = [
        (100, 1, 100, "supervisor-start"),
        (101, 100, 101, "target-start"),
        (102, 101, 102, "detached-start"),
    ]
    pidfds = {101: 51, 102: 52}

    SUPERVISOR.capture_descendant_processes(
        100,
        captured_processes,
        identities=identities,
        pidfd_open=lambda pid, _flags: pidfds[pid],
        read_identity=lambda pid: next(
            identity for identity in identities if identity[0] == pid
        ),
    )

    assert captured_processes == {
        (101, "target-start"): 51,
        (102, "detached-start"): 52,
    }


if __name__ == "__main__":
    test_pidfd_capture_rejects_reused_pid()
    test_signals_exact_captured_pidfds()
    test_capture_excludes_supervisor_identity()
