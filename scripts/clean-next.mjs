import { rm } from 'node:fs/promises';

try {
  await rm('.next', { recursive: true, force: true });
} catch (error) {
  console.error('Failed to clean .next directory', error);
  process.exit(1);
}
