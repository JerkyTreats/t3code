export function ancestorDirectoryPaths(pathValue: string): string[] {
  const segments = pathValue.split("/").filter((segment) => segment.length > 0);
  if (segments.length <= 1) {
    return [];
  }

  const directories: string[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    directories.push(segments.slice(0, index).join("/"));
  }
  return directories;
}
