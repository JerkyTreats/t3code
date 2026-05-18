import type { NativeApi } from "@t3tools/contracts";

import {
  assertNativeApiFeature,
  hasNativeApiFeature,
  resolveNativeApiCapabilities,
  supportsNativeApiGitHub,
  supportsNativeApiGitMerge,
  supportsNativeApiSourceControl,
  type NativeApiCapabilities,
  type NativeApiFeature,
} from "./forkNativeApiAdapter";
import { __resetWsNativeApiForTests, createWsNativeApi } from "./wsNativeApi";

let cachedApi: NativeApi | undefined;

export function readNativeApi(): NativeApi | undefined {
  if (typeof window === "undefined") return undefined;
  if (cachedApi) return cachedApi;

  if (window.nativeApi) {
    cachedApi = window.nativeApi;
    return cachedApi;
  }

  cachedApi = createWsNativeApi();
  return cachedApi;
}

export function ensureNativeApi(): NativeApi {
  const api = readNativeApi();
  if (!api) {
    throw new Error("Native API not found");
  }
  return api;
}

export function readNativeApiCapabilities(): NativeApiCapabilities {
  if (typeof window === "undefined") {
    return resolveNativeApiCapabilities(false);
  }
  return resolveNativeApiCapabilities(Boolean(window.nativeApi));
}

export function hasCurrentNativeApiFeature(feature: NativeApiFeature): boolean {
  return hasNativeApiFeature(readNativeApiCapabilities(), feature);
}

export function ensureCurrentNativeApiFeature(feature: NativeApiFeature): void {
  assertNativeApiFeature(readNativeApiCapabilities(), feature);
}

export function supportsCurrentNativeApiGitMerge(): boolean {
  return supportsNativeApiGitMerge(readNativeApiCapabilities());
}

export function supportsCurrentNativeApiGitHub(): boolean {
  return supportsNativeApiGitHub(readNativeApiCapabilities());
}

export function supportsCurrentNativeApiSourceControl(): boolean {
  return supportsNativeApiSourceControl(readNativeApiCapabilities());
}

export async function __resetNativeApiForTests() {
  cachedApi = undefined;
  await __resetWsNativeApiForTests();
}
