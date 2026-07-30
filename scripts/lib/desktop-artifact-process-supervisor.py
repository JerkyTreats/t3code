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


def read_process_identities():
    identities = []
    for entry in os.listdir("/proc"):
        if not entry.isdigit():
            continue
        try:
            with open(f"/proc/{entry}/stat", encoding="utf-8") as stat_file:
                stat = stat_file.read()
            command_end = stat.rfind(")")
            if command_end < 0:
                continue
            fields = stat[command_end + 2 :].split(" ")
            identities.append((int(entry), int(fields[1]), int(fields[2])))
        except (FileNotFoundError, PermissionError, ProcessLookupError, ValueError):
            continue
    return identities


def capture_descendant_groups(root_pid, captured_groups):
    identities = read_process_identities()
    descendant_pids = {root_pid}
    discovered = True
    while discovered:
        discovered = False
        for pid, parent_pid, _process_group_id in identities:
            if parent_pid in descendant_pids and pid not in descendant_pids:
                descendant_pids.add(pid)
                discovered = True
    for pid, _parent_pid, process_group_id in identities:
        if pid != root_pid and pid in descendant_pids and process_group_id > 1:
            captured_groups.add(process_group_id)


def signal_group(process_group_id, requested_signal):
    try:
        os.killpg(process_group_id, requested_signal)
    except ProcessLookupError:
        return


def group_exists(process_group_id):
    try:
        os.killpg(process_group_id, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


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
    captured_groups = set()
    target = subprocess.Popen(arguments.command, start_new_session=True)
    captured_groups.add(target.pid)

    def forward_signal(requested_signal, _frame):
        try:
            os.kill(target.pid, requested_signal)
        except ProcessLookupError:
            pass

    signal.signal(signal.SIGTERM, forward_signal)
    signal.signal(signal.SIGINT, forward_signal)

    while True:
        capture_descendant_groups(supervisor_pid, captured_groups)
        return_code = target.poll()
        if return_code is not None:
            break
        time.sleep(POLL_INTERVAL_SECONDS)

    capture_descendant_groups(supervisor_pid, captured_groups)
    cleanup_deadline = time.monotonic() + arguments.cleanup_timeout_ms / 1000
    while True:
        capture_descendant_groups(supervisor_pid, captured_groups)
        for process_group_id in captured_groups:
            signal_group(process_group_id, signal.SIGKILL)
        no_children_remain = reap_adopted_children()
        surviving_groups = {
            process_group_id
            for process_group_id in captured_groups
            if group_exists(process_group_id)
        }
        if not surviving_groups and no_children_remain:
            write_supervisor_status("cleanup-ok")
            return normalize_return_code(return_code)
        if time.monotonic() >= cleanup_deadline:
            groups = ", ".join(str(group) for group in sorted(surviving_groups))
            print(
                "T3CODE_ARTIFACT_SMOKE cleanup-failed "
                f"surviving-process-groups={groups} children-remain={not no_children_remain}",
                file=sys.stderr,
                flush=True,
            )
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
