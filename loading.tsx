import './loading.css';

export const LoadingSpinner = () => (
  <div className="loading-spinner" role="status" aria-label="Loading">
    <div className="loading-dots">
      <div className="loading-dot" />
      <div className="loading-dot" />
      <div className="loading-dot" />
      <div className="loading-dot" />
      <div className="loading-dot" />
    </div>
    <span className="loading-text">Loading...</span>
  </div>
);
