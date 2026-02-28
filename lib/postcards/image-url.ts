export function deriveOriginalImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) {
    return null;
  }

  if (imageUrl.includes('/uploads/original/')) {
    return imageUrl;
  }

  if (imageUrl.includes('/uploads/postcard/')) {
    const fileName = imageUrl.split('/').pop()?.toLowerCase() ?? '';
    if (fileName.includes('recrop-')) {
      return null;
    }
    return imageUrl.replace('/uploads/postcard/', '/uploads/original/');
  }

  return null;
}
