/** Share scheme and separator handling between credential selection and all-token inspection. */
export const parseAuthorizationCredential = (header: string | undefined) => {
  const match = header?.trim().match(/^(bearer|dpop)[ \t]+(\S+)$/i);
  if (!match) return undefined;
  return {
    source: match[1]!.toLowerCase() === "bearer" ? ("bearer" as const) : ("dpop" as const),
    token: match[2]!,
  };
};
