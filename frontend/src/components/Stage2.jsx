import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import './Stage2.css';

function deAnonymizeText(text, labelToModel) {
  if (!labelToModel || !text) return text;

  let result = text;
  Object.entries(labelToModel).forEach(([label, modelDisplay]) => {
    result = result.replace(new RegExp(label, 'g'), `**${modelDisplay}**`);
  });
  return result;
}

export default function Stage2({ rankings, labelToModel, aggregateRankings }) {
  const [activeTab, setActiveTab] = useState(0);

  if (!rankings || rankings.length === 0) {
    return null;
  }

  const safeIndex = activeTab < rankings.length ? activeTab : 0;
  const current = rankings[safeIndex];
  const maxBorda =
    aggregateRankings && aggregateRankings.length > 0
      ? Math.max(...aggregateRankings.map((a) => a.borda_score || 1), 1)
      : 1;

  return (
    <div className="stage stage2">
      <div className="stage-header-bar">
        <h3 className="stage-title">Stage 2: De-Anonymized Peer Review &amp; Borda Leaderboard</h3>
      </div>

      {aggregateRankings && aggregateRankings.length > 0 && (
        <div className="aggregate-rankings">
          <h4>🏆 Council Peer Leaderboard (Aggregate Rank &amp; Borda Score)</h4>
          <p className="stage-description">
            Combined blind peer evaluations across all council reviewers (lower average rank &amp; higher Borda points = stronger consensus quality):
          </p>
          <div className="leaderboard-table-wrap">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Council Seat / Model</th>
                  <th>Avg Position</th>
                  <th>Borda Points</th>
                  <th>Relative Score</th>
                  <th>Votes</th>
                </tr>
              </thead>
              <tbody>
                {aggregateRankings.map((agg, index) => {
                  const pct = Math.round(((agg.borda_score || 0) / maxBorda) * 100);
                  const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
                  return (
                    <tr key={index} className={index === 0 ? 'top-rank-row' : ''}>
                      <td className="rank-position">{medal}</td>
                      <td className="rank-model">{agg.model}</td>
                      <td className="rank-score">{Number(agg.average_rank).toFixed(2)}</td>
                      <td className="rank-borda">{agg.borda_score ?? '-'} pts</td>
                      <td className="rank-bar-cell">
                        <div className="rank-progress-bg">
                          <div className="rank-progress-fill" style={{ width: `${Math.max(12, pct)}%` }} />
                        </div>
                      </td>
                      <td className="rank-count">{agg.rankings_count}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h4>Individual Blind Peer Critiques</h4>
      <p className="stage-description">
        Each seat reviewed anonymized drafts (Response A, B, C...). Identities are de-anonymized in <strong>bold</strong> below.
      </p>

      <div className="tabs">
        {rankings.map((rank, index) => {
          const shortModel = rank.model?.split('/')[1] || rank.model;
          return (
            <button
              key={index}
              type="button"
              className={`tab ${safeIndex === index ? 'active' : ''}`}
              onClick={() => setActiveTab(index)}
            >
              <span className="tab-role">{rank.role_name || `Reviewer #${index + 1}`}</span>
              <span className="tab-model-sub">{shortModel}</span>
            </button>
          );
        })}
      </div>

      <div className="tab-content">
        <div className="draft-meta-header">
          <div className="draft-meta-badges">
            {current.role_name && <span className="role-pill-badge">{current.role_name}</span>}
            <span className="model-pill-badge">{current.model}</span>
          </div>
        </div>
        <div className="ranking-content markdown-content">
          <ReactMarkdown>{deAnonymizeText(current.ranking, labelToModel)}</ReactMarkdown>
        </div>

        {current.parsed_ranking && current.parsed_ranking.length > 0 && (
          <div className="parsed-ranking">
            <strong>Extracted Ballot Order:</strong>
            <ol>
              {current.parsed_ranking.map((label, i) => (
                <li key={i}>
                  {labelToModel && labelToModel[label] ? labelToModel[label] : label}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
