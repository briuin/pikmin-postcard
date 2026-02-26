import { PostcardWorkbench } from '@/components/postcard-workbench';

export default function HomePage() {
  return (
    <main>
      <header style={{ marginBottom: '1rem' }}>
        <h1>Pikmin Bloom Postcard</h1>
        <small>Upload postcard photos, detect location with Gemini, and organize on an open map.</small>
      </header>
      <PostcardWorkbench />
    </main>
  );
}
