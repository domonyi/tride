import { useState, useRef, useCallback, useEffect } from "react";

export function BrowserPanel() {
  const [url, setUrl] = useState<string | null>(null);
  const [inputUrl, setInputUrl] = useState("http://localhost:3000");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const navigate = useCallback(() => {
    let target = inputUrl.trim();
    if (!target) return;
    if (!/^https?:\/\//i.test(target)) {
      target = "http://" + target;
      setInputUrl(target);
    }
    setUrl(target);
    setLoading(true);
    setError(false);
  }, [inputUrl]);

  const reload = useCallback(() => {
    if (iframeRef.current && url) {
      setLoading(true);
      setError(false);
      iframeRef.current.src = url;
    }
  }, [url]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        navigate();
      }
    },
    [navigate]
  );

  // Detect load completion
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => setLoading(false);
    const onError = () => {
      setLoading(false);
      setError(true);
    };
    iframe.addEventListener("load", onLoad);
    iframe.addEventListener("error", onError);
    return () => {
      iframe.removeEventListener("load", onLoad);
      iframe.removeEventListener("error", onError);
    };
  }, []);

  return (
    <div className="browser-panel">
      <div className="browser-toolbar">
        <button className="browser-nav-btn" onClick={() => { if (iframeRef.current) { try { iframeRef.current.contentWindow?.history.back(); } catch {} } }} title="Back">
          &lt;
        </button>
        <button className="browser-nav-btn" onClick={() => { if (iframeRef.current) { try { iframeRef.current.contentWindow?.history.forward(); } catch {} } }} title="Forward">
          &gt;
        </button>
        <button className="browser-nav-btn" onClick={reload} title="Reload">
          {loading ? "..." : "R"}
        </button>
        <input
          className="browser-url-input"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="http://localhost:3000"
          spellCheck={false}
        />
        <button className="browser-go-btn" onClick={navigate}>Go</button>
      </div>
      <div className="browser-content">
        {!url ? (
          <div className="browser-error">
            <div className="placeholder-icon">W</div>
            <p>Browser Preview</p>
            <p className="placeholder-sub">
              Enter a URL above and press Go to load a page
            </p>
          </div>
        ) : error ? (
          <div className="browser-error">
            <div className="placeholder-icon">!</div>
            <p>Could not load page</p>
            <p className="placeholder-sub">
              Make sure the dev server is running at {url}
            </p>
            <button className="browser-retry-btn" onClick={reload}>
              Retry
            </button>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={url}
            className="browser-iframe"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            title="Browser Preview"
          />
        )}
      </div>
    </div>
  );
}
