export async function withSupabaseTimeout<T>(promise: PromiseLike<T>, label: string, ms = 15000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`انتهت مهلة تحميل ${label}. جرّب إعادة المحاولة.`)), ms);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function withAbortableSupabaseTimeout<T>(
  request: (signal: AbortSignal) => PromiseLike<T>,
  label: string,
  ms = 15000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`انتهت مهلة تحميل ${label}. جرّب إعادة المحاولة.`));
      }, ms);
    });
    return await Promise.race([Promise.resolve(request(controller.signal)), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
