import { useState, useEffect } from 'react';

export default function SidebarSearch({ onSearch }) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(query);
    }, 220);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="sidebar-search-box">
      <span className="search-icon">🔍</span>
      <input
        type="text"
        className="sidebar-search-input"
        placeholder="Search titles, prompts & syntheses..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button
          type="button"
          className="clear-search-btn"
          onClick={() => setQuery('')}
          title="Clear search"
        >
          ✕
        </button>
      )}
    </div>
  );
}

