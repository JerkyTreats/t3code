#!/usr/bin/env python3

import argparse
import ctypes
import errno
import os
import signal
import subprocess
import sys
import time

PR_SET_CHILD_SUBREAPER = 36
POLL_INTERVAL_SECONDS = 0.01
SUPERVISOR_FAILURE_EXIT_CODE = 125
SUPERVISOR_STATUS_FD = 3


def parse_arguments():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cleanup-timeout-ms", type=int, required=True)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    arguments = parser.parse_args()
    if arguments.cleanup_timeout_ms < 1:
        parser.error("--cleanup-timeout-ms must be positive")
    if arguments.command[:1] == ["--"]:
        arguments.command = arguments.command[1:]
    if not arguments.command:
        parser.error("a supervised command is required")
    return arguments


def enable_child_subreaper():
    libc = ctypes.CDLL(None, use_errno=True)
    if libc.prctl(PR_SET_CHILD_SUBREAPER, 1, 0, 0, 0) != 0:
        error_number = ctypes.get_errno()
        raise OSError(error_number, os.strerror(error_number))


def read_process_identity(pid):
    try:
        with open(f"/proc/{pid}/stat", encoding="utf-8") as stat_file:
            stat = stat_file.read()
        command_end = stat.rfind(")")
        if command_end < 0:
            return None
        fields = stat[command_end + 2 :].split(" ")
        start_time_ticks = fields[19]
        if not start_time_ticks.isdigit():
            return None
        return (pid, int(fields[1]), int(fields[2]), start_time_ticks)
    except (FileNotFoundError, PermissionError, ProcessLookupError, ValueError):
        return None


def read_process_identities():
    identities = []
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        identity = read_process_identity(int(entry))
        if identity is not None:
            identities.append(identity)
    return identities


def open_verified_pidfd(
    identity, pidfd_open=os.pidfd_open, read_identity=read_process_identity
):
    pidfd = pidfd_open(identity[0], 0)
    if read_identity(identity[0]) != identity:
        os.close(pidfd)
        return None
    return pidfd


def capture_descendant_processes(
    root_pid,
    captured_processes,
    identities=None,
    pidfd_open=os.pidfd_open,
    read_identity=read_process_identity,
):
    if identities is None:
        identities = read_process_identities()
    descendant_pids = {root_pid}
    discovered = True
    while discovered:
        discovered = False
        for pid, parent_pid, _process_group_id, _start_time_ticks in identities:
            if parent_pid in descendant_pids and pid not in descendant_pids:
                descendant_pids.add(pid)
                discovered = True
    for identity in identities:
        pid = identity[0]
        identity_key = (pid, identity[3])
        if (
            pid == root_pid
            or pid not in descendant_pids
            or identity_key in captured_processes
        ):
            continue
        try:
            pidfd = open_verified_pidfd(identity, pidfd_open, read_identity)
        except (OSError, ProcessLookupError):
            continue
        if pidfd is not None:
            captured_processes[identity_key] = pidfd


def signal_captured_processes(
    captured_processes,
    requested_signal,
    pidfd_send_signal=signal.pidfd_send_signal,
):
    for pidfd in captured_processes.values():
        try:
            pidfd_send_signal(pidfd, requested_signal)
        except ProcessLookupError:
            continue


def live_captured_processes(
    captured_processes, pidfd_send_signal=signal.pidfd_send_signal
):
    live_processes = set()
    for identity_key, pidfd in captured_processes.items():
        try:
            pidfd_send_signal(pidfd, 0)
            live_processes.add(identity_key)
        except ProcessLookupError:
            continue
    return live_processes


def close_captured_processes(captured_processes):
    for pidfd in captured_processes.values():
        os.close(pidfd)
    captured_processes.clear()


def reap_adopted_children():
    while True:
        try:
            pid, _status = os.waitpid(-1, os.WNOHANG)
        except ChildProcessError:
            return True
        if pid == 0:
            return False


def normalize_return_code(return_code):
    if return_code >= 0:
        return return_code
    return 128 + abs(return_code)


def write_supervisor_status(status):
    os.write(SUPERVISOR_STATUS_FD, f"{status}\n".encode("ascii"))


def main():
    arguments = parse_arguments()
    enable_child_subreaper()
    supervisor_pid = os.getpid()
    captured_processes = {}
    target = subprocess.Popen(arguments.command, start_new_session=True)
    target_identity = read_process_identity(target.pid)
    if target_identity is None:
        raise ProcessLookupError(f"Unable to capture target process {target.pid}.")
    target_pidfd = open_verified_pidfd(target_identity)
    if target_pidfd is None:
        raise ProcessLookupError(f"Target process {target.pid} changed before capture.")
    captured_processes[(target_identity[0], target_identity[3])] = target_pidfd
    termination_requested = False
    termination_deadline = None

    def forward_signal(requested_signal, _frame):
        nonlocal termination_requested
        nonlocal termination_deadline
        termination_requested = True
        if termination_deadline is None:
            termination_deadline = (
                time.monotonic() + arguments.cleanup_timeout_ms / 1000
            )
        try:
            signal.pidfd_send_signal(target_pidfd, requested_signal)
        except (OSError, ProcessLookupError):
            pass

    signal.signal(signal.SIGTERM, forward_signal)
    signal.signal(signal.SIGINT, forward_signal)

    while True:
        identities = read_process_identities()
        capture_descendant_processes(supervisor_pid, captured_processes, identities)
        return_code = target.poll()
        if return_code is not None:
            break
        if (
            termination_requested
            and termination_deadline is not None
            and time.monotonic() >= termination_deadline
        ):
            return_code = -signal.SIGKILL
            break
        time.sleep(POLL_INTERVAL_SECONDS)

    identities = read_process_identities()
    capture_descendant_processes(supervisor_pid, captured_processes, identities)
    cleanup_deadline = time.monotonic() + arguments.cleanup_timeout_ms / 1000
    while True:
        identities = read_process_identities()
        capture_descendant_processes(supervisor_pid, captured_processes, identities)
        signal_captured_processes(captured_processes, signal.SIGKILL)
        no_children_remain = reap_adopted_children()
        surviving_processes = live_captured_processes(captured_processes)
        if not surviving_processes and no_children_remain:
            close_captured_processes(captured_processes)
            write_supervisor_status("cleanup-ok")
            return normalize_return_code(return_code)
        if time.monotonic() >= cleanup_deadline:
            processes = ", ".join(
                f"{pid}:{start_time}"
                for pid, start_time in sorted(surviving_processes)
            )
            print(
                "T3CODE_ARTIFACT_SMOKE cleanup-failed "
                f"surviving-processes={processes} children-remain={not no_children_remain}",
                file=sys.stderr,
                flush=True,
            )
            close_captured_processes(captured_processes)
            write_supervisor_status("cleanup-failed")
            return SUPERVISOR_FAILURE_EXIT_CODE
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except OSError as error:
        if error.errno == errno.ENOSYS:
            detail = "Linux child subreaper support is unavailable."
        else:
            detail = f"Desktop artifact process supervisor failed: {error}"
        print(
            f"T3CODE_ARTIFACT_SMOKE cleanup-failed supervisor-error={detail}",
            file=sys.stderr,
        )
        write_supervisor_status("cleanup-failed")
        sys.exit(SUPERVISOR_FAILURE_EXIT_CODE)
