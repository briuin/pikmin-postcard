type ShareablePostcard = {
  id: string;
  title: string;
};

export async function sharePostcardLink(postcard: ShareablePostcard): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = `${window.location.origin}/postcard/${postcard.id}`;

  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: postcard.title,
        url
      });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  await navigator.clipboard.writeText(url);
  return 'copied';
}
