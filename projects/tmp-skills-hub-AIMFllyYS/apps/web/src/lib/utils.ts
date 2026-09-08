import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 class：冲突时 Tailwind 后写的赢。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
