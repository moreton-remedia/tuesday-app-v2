import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { randomBytes } from 'node:crypto';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nanoid(size = 21): string {
  return randomBytes(size).toString('base64url').slice(0, size);
}

