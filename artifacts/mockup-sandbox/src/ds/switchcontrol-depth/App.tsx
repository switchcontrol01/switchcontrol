import { useEffect, useState, type ComponentType } from 'react';

type ModuleMap = Record<string, () => Promise<Record<string, unknown>>>;
const modules = import.meta.glob('./mockups/**/*.tsx') as ModuleMap;

function resolveComponent(mod: Record<string, unknown>, name: string): ComponentType | undefined {
  const candidates = Object.values(mod).filter((value) => typeof value === 'function') as ComponentType[];
  return (mod.default as ComponentType) || (mod.Preview as ComponentType) || (mod[name] as ComponentType) || candidates[candidates.length - 1];
}

function PreviewRenderer({ componentPath }: { componentPath: string }) {
  const [Component, setComponent] = useState<ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setComponent(null);
    setError(null);
    const key = `./mockups/${componentPath}.tsx`;
    const loader = modules[key];
    if (!loader) {
      setError(`No component found at ${componentPath}.tsx`);
      return () => { cancelled = true; };
    }
    void loader().then((mod) => {
      if (cancelled) return;
      const name = componentPath.split('/').pop() ?? '';
      const component = resolveComponent(mod, name);
      if (!component) {
        setError(`No exported React component found in ${componentPath}.tsx`);
        return;
      }
      setComponent(() => component);
    }).catch((reason: unknown) => {
      if (!cancelled) setError(`Failed to load preview. ${reason instanceof Error ? reason.message : String(reason)}`);
    });
    return () => { cancelled = true; };
  }, [componentPath]);

  if (error) return <pre style={{ color: '#df8571', padding: '2rem', whiteSpace: 'pre-wrap' }}>{error}</pre>;
  return Component ? <Component /> : <div aria-label="Loading preview" />;
}

function Gallery() {
  return <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#101816', color: '#e7ecdf', fontFamily: 'DM Sans, sans-serif' }}>
    <div style={{ maxWidth: 440, padding: 32 }}>
      <div style={{ color: '#d2f36b', font: '11px IBM Plex Mono, monospace', letterSpacing: '.12em' }}>SWITCHCONTROL / DEPTH</div>
      <h1 style={{ font: '600 30px Outfit, sans-serif' }}>Design system preview</h1>
      <p>Open <code>#/SystemPreview</code> to inspect the live system preview.</p>
    </div>
  </main>;
}

function getPreviewPath(): string | null {
  const path = window.location.hash.replace(/^#\/?/, '').replace(/\/$/, '');
  return path || null;
}

function App() {
  const [previewPath, setPreviewPath] = useState<string | null>(getPreviewPath());
  useEffect(() => {
    const onHashChange = () => setPreviewPath(getPreviewPath());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  return previewPath ? <PreviewRenderer componentPath={previewPath} /> : <Gallery />;
}

export default App;
