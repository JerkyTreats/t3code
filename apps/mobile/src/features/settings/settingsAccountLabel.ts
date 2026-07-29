export function settingsAccountLabel(input: {
  readonly isLoaded: boolean;
  readonly isSignedIn: boolean | undefined;
  readonly emailAddress: string | undefined;
}): string {
  if (!input.isLoaded) return "Checking";
  if (!input.isSignedIn) return "Sign in";
  return input.emailAddress ?? "Signed in";
}
