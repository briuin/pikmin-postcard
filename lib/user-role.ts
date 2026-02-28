import { UserRole } from '@prisma/client';

const DEFAULT_ADMIN_EMAILS = ['dreamingdexiaoxiaohao@gmail.com'];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getBootstrapAdminEmails(): Set<string> {
  const fromEnv = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  return new Set([...DEFAULT_ADMIN_EMAILS, ...fromEnv].map((item) => normalizeEmail(item)));
}

export function roleForEmail(email: string): UserRole {
  return getBootstrapAdminEmails().has(normalizeEmail(email)) ? UserRole.ADMIN : UserRole.MEMBER;
}

export function isAdminRole(role: UserRole): boolean {
  return role === UserRole.ADMIN;
}

export function isManagerOrAboveRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}
