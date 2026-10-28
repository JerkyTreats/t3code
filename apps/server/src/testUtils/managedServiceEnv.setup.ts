// Agents inside a managed T3 runtime inherit its home; tests must never use it.
delete process.env.T3CODE_HOME;
