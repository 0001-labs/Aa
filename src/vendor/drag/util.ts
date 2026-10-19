import type { Cleanup } from './types';

export function once<T extends (...args: never[]) => unknown>(fn: T): T {
  let hasRun = false;
  let result: ReturnType<T>;

  return ((...args: Parameters<T>) => {
    if (!hasRun) {
      hasRun = true;
      result = fn(...args) as ReturnType<T>;
    }

    return result;
  }) as T;
}

export function combine(...cleanups: Cleanup[]): Cleanup {
  return once(() => {
    for (const cleanup of cleanups) {
      cleanup();
    }
  });
}

export function reorder<T>(args: {
  list: readonly T[];
  startIndex: number;
  finishIndex: number;
}): T[] {
  const { list, startIndex, finishIndex } = args;

  if (!Number.isInteger(startIndex) || !Number.isInteger(finishIndex)) {
    throw new TypeError('reorder indexes must be integers.');
  }

  if (startIndex < 0 || startIndex >= list.length) {
    throw new RangeError('startIndex is outside the list.');
  }

  if (finishIndex < 0 || finishIndex >= list.length) {
    throw new RangeError('finishIndex is outside the list.');
  }

  if (startIndex === finishIndex) {
    return [...list];
  }

  const result = [...list];
  const [item] = result.splice(startIndex, 1);

  if (item === undefined) {
    throw new RangeError('startIndex is outside the list.');
  }

  result.splice(finishIndex, 0, item);
  return result;
}
