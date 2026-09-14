let activeOperations = 0;
let cleanupDone: Promise<void> | undefined;

export async function acquireTestFileActivity(): Promise<() => void> {
  while (cleanupDone) await cleanupDone;
  activeOperations++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeOperations--;
  };
}

export async function withTestFileActivity<Result>(operation: () => Promise<Result>): Promise<Result> {
  const release = await acquireTestFileActivity();
  try { return await operation(); } finally { release(); }
}

export async function withTestFileCleanup<Result>(operation: () => Promise<Result>): Promise<Result | null> {
  if (activeOperations || cleanupDone) return null;
  let finish!: () => void;
  cleanupDone = new Promise<void>(resolve => { finish = resolve; });
  try { return await operation(); }
  finally { cleanupDone = undefined; finish(); }
}
